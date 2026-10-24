'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { planExport, prepareExport, prepareExportFiles, existingFiles, writeExport, readMessages } = require('../src/files');
const { generateBulk } = require('../src/hl7/bulk');

const NOW = new Date(2026, 9, 24, 12, 0, 0);

function sample(count, types = ['ADT^A01', 'ORU^R01']) {
  const result = generateBulk({ count, types, mode: 'independent', seed: 'export' });
  return result.messages.map((m) => m.text);
}

test('one file: a single file with every message', () => {
  const plan = planExport(sample(5), { mode: 'one', now: NOW });
  assert.strictEqual(plan.length, 1);
  assert.strictEqual(plan[0].texts.length, 5);
  assert.match(plan[0].fileName, /^messages_5_\d{14}\.hl7$/);
});

test('each: one file per message with unique names', () => {
  const plan = planExport(sample(6), { mode: 'each', now: NOW });
  assert.strictEqual(plan.length, 6);
  assert.strictEqual(new Set(plan.map((f) => f.fileName)).size, 6);
  for (const file of plan) assert.strictEqual(file.texts.length, 1);
});

test('type: one file per message type', () => {
  const plan = planExport(sample(6), { mode: 'type', now: NOW });
  assert.deepStrictEqual(plan.map((f) => f.fileName).sort(), ['ADT_A01.hl7', 'ORU_R01.hl7']);
  assert.strictEqual(plan.reduce((n, f) => n + f.texts.length, 0), 6);
});

test('file names contain nothing unsafe', () => {
  const text = 'MSH|^~\\&|A|B|C|D|20260101||ADT^A01|../../evil:id|P|2.5\r';
  const [file] = planExport([text], { mode: 'each', now: NOW });
  assert.doesNotMatch(file.fileName, /[\\/:]/);
});

test('rejects an unknown mode and an empty list', () => {
  assert.throws(() => planExport(sample(2), { mode: 'zip' }));
  assert.throws(() => planExport([], { mode: 'one' }));
});

test('batch and MLLP cannot be combined', () => {
  assert.throws(() => prepareExport(sample(2), { batch: true, mllp: true }), /cannot be combined/);
});

test('a batch file reads back as the same messages', () => {
  const texts = sample(5);
  const { data } = prepareExport(texts, { batch: true, fileName: 'x.hl7', now: NOW });
  const text = data.toString('utf8');
  assert.match(text, /^FHS\|/);
  assert.match(text, /BTS\|5\r/);
  const back = readMessages(data);
  assert.strictEqual(back.batch, true);
  assert.deepStrictEqual(back.messages.map((m) => m.controlId), texts.map((t) => /^MSH(?:\|[^|\r]*){8}\|([^|\r]*)/.exec(t)[1]));
});

test('an MLLP export reads back too', () => {
  const texts = sample(3);
  const { data } = prepareExport(texts, { mllp: true, now: NOW });
  const back = readMessages(data);
  assert.strictEqual(back.messages.length, 3);
  assert.strictEqual(back.format.mllp, true);
});

test('line endings are applied', () => {
  const { data } = prepareExport(sample(2), { lineEnding: 'crlf', now: NOW });
  assert.match(data.toString('utf8'), /\r\n/);
  assert.doesNotMatch(data.toString('utf8').replaceAll('\r\n', ''), /[\r\n]/);
});

test('writeExport writes the files and reports progress; existingFiles sees them', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hl7export-'));
  try {
    const prepared = prepareExportFiles(planExport(sample(7), { mode: 'each', now: NOW }), { lineEnding: 'cr', encoding: 'utf-8' });
    assert.deepStrictEqual(await existingFiles(dir, prepared), []);
    const progress = [];
    const result = await writeExport(dir, prepared, (done, total) => progress.push([done, total]));
    assert.strictEqual(result.files, 7);
    assert.deepStrictEqual(progress.at(-1), [7, 7]);
    assert.strictEqual(fs.readdirSync(dir).length, 7);
    assert.strictEqual((await existingFiles(dir, prepared)).length, 7);
    const first = readMessages(fs.readFileSync(path.join(dir, prepared[0].fileName)));
    assert.strictEqual(first.messages.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a character the encoding cannot hold stops the export before any file', () => {
  const text = 'MSH|^~\\&|A|B|C|D|20260101||ADT^A01|1|P|2.5\rPID|1||1||Дмитро^X\r';
  assert.throws(() => prepareExportFiles(planExport([text], { mode: 'one', now: NOW }), { encoding: 'windows-1252' }));
});
