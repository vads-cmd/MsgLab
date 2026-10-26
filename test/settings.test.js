'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cleanSettings, cleanFavorites, cleanProfiles, loadSettings, saveSettings, REMEMBERED_CONTROLS, MAX_PROFILES } = require('../src/settings');

test('cleanSettings keeps known controls with text or true/false values', () => {
  const result = cleanSettings({ controls: { 'gen-version': '2.5', 'file-mllp': true, 'gen-seed': 'abc', 'file-eol': 5, 'gen-type': 'x'.repeat(500) }, folder: '/tmp/x' });
  assert.deepStrictEqual(result, { controls: { 'gen-version': '2.5', 'file-mllp': true }, folder: '/tmp/x', folders: { save: null, export: null }, favorites: [], profiles: [] });
});

test('cleanSettings copes with nonsense', () => {
  for (const bad of [null, undefined, 5, 'x', [], { controls: [], folder: 7 }]) {
    assert.deepStrictEqual(cleanSettings(bad), { controls: {}, folder: null, folders: { save: null, export: null }, favorites: [], profiles: [] });
  }
});

test('the server settings are remembered, the test message box is not', () => {
  for (const id of ['send-host', 'send-port', 'send-connect-timeout', 'send-reply-timeout', 'send-encoding', 'send-rate', 'send-delay-custom', 'send-stop-on-error']) assert.ok(REMEMBERED_CONTROLS.has(id), id);
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
    assert.deepStrictEqual(await loadSettings(file), { controls: {}, folder: null, folders: none, favorites: [], profiles: [] });
    await saveSettings(file, { controls: { 'file-eol': 'crlf', 'export-batch': false }, folder: dir, folders: { save: dir, export: null }, favorites: ['ADT^A01', 'ORU^R01'] });
    assert.deepStrictEqual(await loadSettings(file), { controls: { 'file-eol': 'crlf', 'export-batch': false }, folder: dir, folders: { save: dir, export: null }, favorites: ['ADT^A01', 'ORU^R01'], profiles: [] });
    assert.ok(!fs.existsSync(`${file}.tmp`));
    fs.writeFileSync(file, '{ not json');
    assert.deepStrictEqual(await loadSettings(file), { controls: {}, folder: null, folders: none, favorites: [], profiles: [] });
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

const PROFILE = { name: 'Test server', host: 'hapi.example.org', port: 2575, connectTimeout: 10, replyTimeout: 30, encoding: 'utf-8' };

test('a good saved connection is kept as it is', () => {
  assert.deepStrictEqual(cleanProfiles([PROFILE]), [PROFILE]);
});

test('names and hosts are trimmed, text numbers become numbers, missing options get defaults', () => {
  const [profile] = cleanProfiles([{ name: '  Lab  ', host: ' 10.0.0.5 ', port: '6661' }]);
  assert.deepStrictEqual(profile, { name: 'Lab', host: '10.0.0.5', port: 6661, connectTimeout: 10, replyTimeout: 30, encoding: 'utf-8' });
});

test('an unknown encoding and silly timeouts are replaced by the defaults', () => {
  const [profile] = cleanProfiles([{ ...PROFILE, encoding: 'latin-9', connectTimeout: 0, replyTimeout: 99999 }]);
  assert.strictEqual(profile.encoding, 'utf-8');
  assert.strictEqual(profile.connectTimeout, 10);
  assert.strictEqual(profile.replyTimeout, 30);
});

test('connections that cannot be used are dropped', () => {
  const bad = [
    null, 5, 'x', [], {}, { ...PROFILE, name: '' }, { ...PROFILE, name: '   ' }, { ...PROFILE, name: 'x'.repeat(61) }, { ...PROFILE, name: 'a\nb' },
    { ...PROFILE, host: '' }, { ...PROFILE, host: 'a b' }, { ...PROFILE, host: 'x'.repeat(254) }, { ...PROFILE, host: 5 },
    { ...PROFILE, port: 0 }, { ...PROFILE, port: 65536 }, { ...PROFILE, port: 25.5 }, { ...PROFILE, port: 'abc' }, { ...PROFILE, port: '' }, { ...PROFILE, port: null },
  ];
  for (const item of bad) assert.deepStrictEqual(cleanProfiles([item]), [], JSON.stringify(item));
  assert.deepStrictEqual(cleanProfiles('nonsense'), []);
  assert.deepStrictEqual(cleanProfiles(undefined), []);
});

test('an IPv6 address may be written in brackets', () => {
  assert.strictEqual(cleanProfiles([{ ...PROFILE, host: '[::1]' }])[0].host, '[::1]');
});

test('names are unique ignoring case, the first one wins, and the order is kept', () => {
  const list = cleanProfiles([{ ...PROFILE, name: 'B' }, { ...PROFILE, name: 'a' }, { ...PROFILE, name: 'b', port: 1 }, { ...PROFILE, name: 'A', port: 2 }]);
  assert.deepStrictEqual(list.map((item) => item.name), ['B', 'a']);
  assert.strictEqual(list[0].port, 2575);
});

test('at most one hundred connections are kept', () => {
  const many = Array.from({ length: MAX_PROFILES + 20 }, (_, index) => ({ ...PROFILE, name: `Server ${index}` }));
  assert.strictEqual(cleanProfiles(many).length, MAX_PROFILES);
});

test('saved connections are part of the settings file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profiles-'));
  const file = path.join(dir, 'settings.json');
  await saveSettings(file, { profiles: [PROFILE, { name: '', host: 'x', port: 1 }] });
  const loaded = await loadSettings(file);
  assert.deepStrictEqual(loaded.profiles, [PROFILE]);
  assert.deepStrictEqual(cleanSettings({ profiles: 'nonsense' }).profiles, []);
  fs.rmSync(dir, { recursive: true, force: true });
});
