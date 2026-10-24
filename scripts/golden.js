'use strict';

/**
 * Regression snapshot. Runs the generator, parser, validator and explainer over a few thousand
 * inputs (generated messages and damaged copies of them) and keeps a short fingerprint of every
 * result. test/golden.test.js compares against the saved fingerprints, so a change that alters
 * any output is noticed.
 *
 * After a change in behavior that is intended:  node scripts/golden.js --update
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { generate, VERSIONS, MANUAL_FIELDS } = require('../src/hl7/generator');
const { parseMessage, get } = require('../src/hl7/parser');
const { validate } = require('../src/hl7/validator');
const { explain } = require('../src/hl7/explainer');

const SNAPSHOT_FILE = path.join(__dirname, '..', 'test', 'golden.snapshot.json');
const NOW = new Date(2026, 9, 23, 12, 0, 0);
const TYPES = ['ADT^A01', 'ADT^A02', 'ADT^A03', 'ADT^A08', 'ADT^A18', 'ADT^A40', 'ADT^A60', 'ORM^O01', 'ORU^R01'];
const SEEDS = [1, 2, 3, 'abc', 42, 'x y'];
const MANUAL_VALUES = [null, 'Zz9', ' lead', 'trail ', 'a|b^c'];
const INSERTED = '|^~\\&\r\n 9XZ';
const PATHS = ['MSH-9.2', 'MSH-12', 'PID-3.1', 'PID-5.1', 'PID-5.2', 'PID-7', 'PV1-3.1', 'PV1-44', 'OBX[2]-5', 'PID-3(2).1'];

function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

// A small random generator of its own, so the damage done to messages never depends on project code.
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Damage a message in one of nine ways. */
function mutate(text, random) {
  const below = (n) => Math.floor(random() * n);
  const lines = text.split('\n');
  const line = below(lines.length);
  const fields = lines[line].split('|');
  const field = below(fields.length);
  switch (below(9)) {
    case 0: { const i = below(text.length); return text.slice(0, i) + text.slice(i + 1); }
    case 1: { const i = below(text.length + 1); return text.slice(0, i) + INSERTED[below(INSERTED.length)] + text.slice(i); }
    case 2: lines.splice(line, 1); break;
    case 3: lines.splice(line, 0, lines[line]); break;
    case 4: { const other = below(lines.length); [lines[line], lines[other]] = [lines[other], lines[line]]; break; }
    case 5: fields[field] = below(2) ? '' : 'XX'; lines[line] = fields.join('|'); break;
    case 6: lines[line] += ' '.repeat(1 + below(3)); break;
    case 7: fields[field] += '^A&B~C'; lines[line] = fields.join('|'); break;
    default: fields[field] = ` ${fields[field]} `; lines[line] = fields.join('|'); break;
  }
  return lines.join('\n');
}

function computeHashes() {
  const out = {};
  const bases = [];

  const add = (name, options) => {
    const result = generate({ now: NOW, ...options });
    out[`generate:${name}`] = fingerprint(result);
    bases.push({ name, text: result.text });
  };
  for (const type of TYPES) {
    for (const version of VERSIONS) {
      for (const seed of SEEDS) add(`${type}:${version}:${seed}`, { type, version, seed });
    }
    for (const key of MANUAL_FIELDS) {
      for (const value of MANUAL_VALUES) add(`${type}:${key}:${JSON.stringify(value)}`, { type, seed: 7, fields: { [key]: value } });
    }
  }

  const check = (name, text) => {
    out[`validate:${name}`] = fingerprint(validate(text));
    out[`explain:${name}`] = fingerprint(explain(text));
  };
  const random = makeRandom(2026);
  bases.forEach((base, index) => {
    check(base.name, base.text);
    check(`${base.name}:cr`, base.text.replaceAll('\n', '\r'));
    if (index % 3 === 0) {
      for (let k = 0; k < 5; k++) check(`${base.name}#${k}`, mutate(base.text, random));
    }
    if (index % 10 === 0) {
      const parsed = parseMessage(base.text);
      out[`parse:${base.name}`] = fingerprint({ parsed, values: PATHS.map((p) => get(parsed, p)) });
    }
  });
  return out;
}

if (require.main === module) {
  const hashes = computeHashes();
  if (process.argv.includes('--update')) {
    fs.writeFileSync(SNAPSHOT_FILE, `${JSON.stringify(hashes, null, 1)}\n`);
    console.log(`Saved ${Object.keys(hashes).length} fingerprints to ${path.relative(process.cwd(), SNAPSHOT_FILE)}`);
  } else {
    console.log(`${Object.keys(hashes).length} fingerprints computed (use --update to save them)`);
  }
}

module.exports = { computeHashes, SNAPSHOT_FILE };
