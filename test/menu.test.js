'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildMenuTemplate, buildEditorMenuTemplate, FILE_COMMANDS } = require('../src/menu');

function build(extra = {}) {
  const sent = [];
  return { sent, template: buildMenuTemplate({ send: (c) => sent.push(c), isMac: false, appName: 'HL7 Workbench', devTools: false, ...extra }) };
}

test('the File menu has the five commands with their shortcuts', () => {
  const { template } = build();
  const file = template.find((m) => m.label === 'File');
  const items = file.submenu.filter((i) => i.click);
  assert.deepStrictEqual(items.map((i) => i.accelerator), ['CmdOrCtrl+N', 'CmdOrCtrl+O', 'CmdOrCtrl+S', 'CmdOrCtrl+Shift+S', 'CmdOrCtrl+E']);
});

test('shortcuts are unique', () => {
  assert.strictEqual(new Set(FILE_COMMANDS.map((c) => c.accelerator)).size, FILE_COMMANDS.length);
});

test('choosing an item sends its command', () => {
  const { template, sent } = build();
  for (const item of template.find((m) => m.label === 'File').submenu) item.click?.();
  assert.deepStrictEqual(sent, ['new', 'open', 'save', 'saveAs', 'export']);
});

test('Edit has the clipboard roles, so copy and paste keep working in the text area', () => {
  const roles = build().template.find((m) => m.label === 'Edit').submenu.map((i) => i.role);
  for (const role of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']) assert.ok(roles.includes(role), role);
});

test('developer tools only when asked for', () => {
  const roles = (devTools) => build({ devTools }).template.find((m) => m.label === 'View').submenu.map((i) => i.role);
  assert.ok(!roles(false).includes('toggleDevTools'));
  assert.ok(roles(true).includes('toggleDevTools'));
});

test('macOS gets an app menu first and Close instead of Quit in File', () => {
  const { template } = build({ isMac: true });
  assert.strictEqual(template[0].label, 'HL7 Workbench');
  const last = template.find((m) => m.label === 'File').submenu.at(-1);
  assert.strictEqual(last.role, 'close');
});

test('Help has About, which sends the "about" command (the app menu has it on macOS)', () => {
  const win = build();
  const help = win.template.find((m) => m.label === 'Help');
  assert.strictEqual(help.submenu[0].label, 'About HL7 Workbench');
  help.submenu[0].click();
  assert.deepStrictEqual(win.sent, ['about']);

  const mac = build({ isMac: true });
  assert.ok(!mac.template.some((m) => m.label === 'Help'));
  mac.template[0].submenu[0].click();
  assert.deepStrictEqual(mac.sent, ['about']);
});

test('the editor menu has the clipboard roles and the line commands, in that order', () => {
  const items = buildEditorMenuTemplate({ send: () => {}, hasSelection: true, hasText: true });
  const names = items.filter((i) => i.type !== 'separator').map((i) => i.role ?? i.label);
  assert.deepStrictEqual(names, ['undo', 'redo', 'cut', 'copy', 'paste', 'Select line', 'selectAll', 'Duplicate line']);
});

test('the editor menu commands are sent to the page', () => {
  const sent = [];
  const items = buildEditorMenuTemplate({ send: (c) => sent.push(c), hasText: true });
  for (const item of items) item.click?.();
  assert.deepStrictEqual(sent, ['selectLine', 'duplicateLine']);
});

test('Cut and Copy need a selection, the line commands and Select all need text', () => {
  const state = (hasSelection, hasText) => Object.fromEntries(
    buildEditorMenuTemplate({ send: () => {}, hasSelection, hasText }).filter((i) => i.enabled !== undefined).map((i) => [i.role ?? i.label, i.enabled]),
  );
  assert.deepStrictEqual(state(false, false), { cut: false, copy: false, 'Select line': false, selectAll: false, 'Duplicate line': false });
  assert.deepStrictEqual(state(true, true), { cut: true, copy: true, 'Select line': true, selectAll: true, 'Duplicate line': true });
});

test('Duplicate line shows its shortcut without registering it a second time', () => {
  const item = buildEditorMenuTemplate({ send: () => {} }).find((i) => i.label === 'Duplicate line');
  assert.strictEqual(item.accelerator, 'CmdOrCtrl+D');
  assert.strictEqual(item.registerAccelerator, false);
});
