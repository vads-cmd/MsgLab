'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cleanSettings, loadSettings, saveSettings, REMEMBERED_CONTROLS } = require('../src/settings');

test('cleanSettings keeps known controls with text or true/false values', () => {
  const result = cleanSettings({ controls: { 'gen-version': '2.5', 'file-mllp': true, 'gen-seed': 'abc', 'file-eol': 5, 'gen-type': 'x'.repeat(500) }, folder: '/tmp/x' });
  assert.deepStrictEqual(result, { controls: { 'gen-version': '2.5', 'file-mllp': true }, folder: '/tmp/x' });
});

test('cleanSettings copes with nonsense', () => {
  for (const bad of [null, undefined, 5, 'x', [], { controls: [], folder: 7 }]) {
    assert.deepStrictEqual(cleanSettings(bad), { controls: {}, folder: null });
  }
});

test('seed and manual values are not remembered', () => {
  assert.ok(!REMEMBERED_CONTROLS.has('gen-seed'));
  assert.ok(![...REMEMBERED_CONTROLS].some((id) => id.startsWith('manual-') && id !== 'manual-show-optional'));
});

test('save then load round-trips; missing and damaged files give empty settings', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hl7settings-'));
  try {
    const file = path.join(dir, 'settings.json');
    assert.deepStrictEqual(await loadSettings(file), { controls: {}, folder: null });
    await saveSettings(file, { controls: { 'file-eol': 'crlf', 'export-batch': false }, folder: dir });
    assert.deepStrictEqual(await loadSettings(file), { controls: { 'file-eol': 'crlf', 'export-batch': false }, folder: dir });
    assert.ok(!fs.existsSync(`${file}.tmp`));
    fs.writeFileSync(file, '{ not json');
    assert.deepStrictEqual(await loadSettings(file), { controls: {}, folder: null });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
