'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildMenuTemplate, FILE_COMMANDS } = require('../src/menu');

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
