'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { computeHashes, SNAPSHOT_FILE } = require('../scripts/golden');

test('generator, parser, validator and explainer give the same results as when the snapshot was saved', () => {
  const saved = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
  const now = computeHashes();
  assert.deepStrictEqual(Object.keys(now), Object.keys(saved), 'the set of cases changed');
  const changed = Object.keys(now).filter((key) => now[key] !== saved[key]);
  assert.strictEqual(changed.length, 0, `${changed.length} results changed, for example: ${changed.slice(0, 5).join(', ')}`);
});
