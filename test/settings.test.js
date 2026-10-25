'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cleanSettings, cleanFavorites, loadSettings, saveSettings, REMEMBERED_CONTROLS } = require('../src/settings');

test('cleanSettings keeps known controls with text or true/false values', () => {
  const result = cleanSettings({ controls: { 'gen-version': '2.5', 'file-mllp': true, 'gen-seed': 'abc', 'file-eol': 5, 'gen-type': 'x'.repeat(500) }, folder: '/tmp/x' });
  assert.deepStrictEqual(result, { controls: { 'gen-version': '2.5', 'file-mllp': true }, folder: '/tmp/x', folders: { save: null, export: null }, favorites: [] });
});

test('cleanSettings copes with nonsense', () => {
  for (const bad of [null, undefined, 5, 'x', [], { controls: [], folder: 7 }]) {
    assert.deepStrictEqual(cleanSettings(bad), { controls: {}, folder: null, folders: { save: null, export: null }, favorites: [] });
  }
});

test('the server settings are remembered, the test message box is not', () => {
  for (const id of ['send-host', 'send-port', 'send-connect-timeout', 'send-reply-timeout', 'send-encoding']) assert.ok(REMEMBERED_CONTROLS.has(id), id);
  assert.ok(!REMEMBERED_CONTROLS.has('send-test-message'), 'the test message box starts off every time');
});

test('seed and manual values are not remembered', () => {
  assert.ok(!REMEMBERED_CONTROLS.has('gen-seed'));
  assert.ok(![...REMEMBERED_CONTROLS].some((id) => id.startsWith('manual-') && id !== 'manual-show-optional'));
});

test('save then load round-trips; missing and damaged files give empty settings', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hl7settings-'));
  try {
    const file = path.join(dir, 'settings.json');
    const none = { save: null, export: null };
    assert.deepStrictEqual(await loadSettings(file), { controls: {}, folder: null, folders: none, favorites: [] });
    await saveSettings(file, { controls: { 'file-eol': 'crlf', 'export-batch': false }, folder: dir, folders: { save: dir, export: null }, favorites: ['ADT^A01', 'ORU^R01'] });
    assert.deepStrictEqual(await loadSettings(file), { controls: { 'file-eol': 'crlf', 'export-batch': false }, folder: dir, folders: { save: dir, export: null }, favorites: ['ADT^A01', 'ORU^R01'] });
    assert.ok(!fs.existsSync(`${file}.tmp`));
    fs.writeFileSync(file, '{ not json');
    assert.deepStrictEqual(await loadSettings(file), { controls: {}, folder: null, folders: none, favorites: [] });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('default folders: only the known kinds, only short text', () => {
  const result = cleanSettings({ folders: { save: '/a/b', export: '', other: '/x' } });
  assert.deepStrictEqual(result.folders, { save: '/a/b', export: null });
  assert.deepStrictEqual(cleanSettings({ folders: { save: 5, export: 'y'.repeat(2000) } }).folders, { save: null, export: null });
  assert.deepStrictEqual(cleanSettings({ folders: 'x' }).folders, { save: null, export: null });
});

test('favourites: plain type names only, no repeats, a list only', () => {
  assert.deepStrictEqual(cleanFavorites(['ADT^A01', 'ORM^O01', 'ADT^A01', 'ACK']), ['ADT^A01', 'ORM^O01', 'ACK']);
  assert.deepStrictEqual(cleanFavorites(['<b>', '', 5, null, 'x'.repeat(50), 'ORU^R01']), ['ORU^R01']);
  assert.deepStrictEqual(cleanFavorites('ADT^A01'), []);
  assert.deepStrictEqual(cleanFavorites(undefined), []);
  assert.strictEqual(cleanFavorites(Array.from({ length: 500 }, (_, i) => `T${i}`)).length, 200);
  assert.deepStrictEqual(cleanSettings({ favorites: ['ACK'] }).favorites, ['ACK']);
});
