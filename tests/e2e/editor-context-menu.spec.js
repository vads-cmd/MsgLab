// Editor context menu: the right-click menu of the editor (Undo, Redo, Cut, Copy, Paste,
// Select line, Select All, Duplicate line).
// The real popup is a native menu. rightClickEditor() keeps the menu instead of showing it, so the
// tests read its items and choose them like a click would.

const { test, expect } = require('@playwright/test');
const {
  waitForWindow, clearDirtyState, goTo, closeApp, takeScreenshotOnFailure, launchApp,
  rightClickEditor, editorMenuItems, chooseEditorMenuItem, tid,
} = require('./helpers');

const TEXT = 'MSH|a\nPID|b\nPV1|c';

test.describe('Editor context menu', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;

  test.beforeEach(async () => {
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
  });

  const enabledByLabel = async () => Object.fromEntries((await editorMenuItems(electronApp)).map((item) => [item.label, item.enabled]));
  const selection = () => window.evaluate(() => {
    const ta = document.getElementById('message');
    return { start: ta.selectionStart, end: ta.selectionEnd, text: ta.value.substring(ta.selectionStart, ta.selectionEnd) };
  });
  const setCaret = (start, end = start) => window.evaluate(([from, to]) => document.getElementById('message').setSelectionRange(from, to), [start, end]);

  test('a right-click opens the editor menu with all its actions', async () => {
    await tid(window, 'message').fill(TEXT);
    await rightClickEditor(electronApp, window);
    const labels = (await editorMenuItems(electronApp)).map((item) => item.label);
    for (const wanted of ['Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Select line', 'Select All', 'Duplicate line']) expect.soft(labels).toContain(wanted);
  });

  test('which actions are on depends on the text and the selection', async () => {
    // empty editor: nothing to cut, copy, select or duplicate
    await rightClickEditor(electronApp, window);
    expect.soft(await enabledByLabel()).toMatchObject({ Cut: false, Copy: false, 'Select line': false, 'Select All': false, 'Duplicate line': false });
    // text, nothing selected
    await tid(window, 'message').fill(TEXT);
    await rightClickEditor(electronApp, window);
    expect.soft(await enabledByLabel()).toMatchObject({ Cut: false, Copy: false, 'Select line': true, 'Select All': true, 'Duplicate line': true });
    // text, with a selection
    await setCaret(0, 5);
    await rightClickEditor(electronApp, window, { keepSelection: true });
    expect.soft(await enabledByLabel()).toMatchObject({ Cut: true, Copy: true });
  });

  test('Select line selects the line with the caret, with its line break', async () => {
    await tid(window, 'message').fill(TEXT);
    await rightClickEditor(electronApp, window); // the click itself moves the caret, so the caret is set afterwards
    await setCaret(8); // inside PID|b
    await chooseEditorMenuItem(electronApp, 'Select line');
    expect((await selection()).text).toBe('PID|b\n');
  });

  test('Select line works on the first line and on the last line (which has no line break)', async () => {
    await tid(window, 'message').fill(TEXT);
    await rightClickEditor(electronApp, window);
    await setCaret(0);
    await chooseEditorMenuItem(electronApp, 'Select line');
    expect.soft((await selection()).text).toBe('MSH|a\n');
    await setCaret(TEXT.length);
    await chooseEditorMenuItem(electronApp, 'Select line');
    expect.soft((await selection()).text).toBe('PV1|c');
  });

  test('Select line takes every line that a selection touches', async () => {
    await tid(window, 'message').fill(TEXT);
    await rightClickEditor(electronApp, window);
    await setCaret(3, 8); // from inside MSH|a to inside PID|b
    await chooseEditorMenuItem(electronApp, 'Select line');
    expect((await selection()).text).toBe('MSH|a\nPID|b\n');
  });

  test('Select All is the standard select-all action of the window', async () => {
    // The click of a role item is carried out by Electron on the window that has the OS focus, which a test
    // window does not have, so the selection itself cannot be checked here (check it by hand: right-click > Select All).
    await tid(window, 'message').fill(TEXT);
    await rightClickEditor(electronApp, window);
    const item = await electronApp.evaluate(() => {
      const found = globalThis.e2eEditorMenu.items.find((entry) => entry.label === 'Select All');
      return { role: String(found.role).toLowerCase(), enabled: found.enabled };
    });
    expect(item).toEqual({ role: 'selectall', enabled: true });
  });

  test('Duplicate line copies the line below itself and leaves the caret in the copy', async () => {
    await tid(window, 'message').fill(TEXT);
    await rightClickEditor(electronApp, window);
    await setCaret(0);
    await chooseEditorMenuItem(electronApp, 'Duplicate line');
    await expect(tid(window, 'message')).toHaveValue('MSH|a\nMSH|a\nPID|b\nPV1|c');
    expect(await selection()).toMatchObject({ start: 6, end: 6 });
  });

  test('Duplicate line copies all the selected lines and selects the copy', async () => {
    await tid(window, 'message').fill(TEXT);
    await rightClickEditor(electronApp, window);
    await setCaret(0, 11); // MSH|a and PID|b
    await chooseEditorMenuItem(electronApp, 'Duplicate line');
    await expect(tid(window, 'message')).toHaveValue('MSH|a\nPID|b\nMSH|a\nPID|b\nPV1|c');
    expect((await selection()).text).toBe('MSH|a\nPID|b');
  });

  test('opening the menu again and again does not change the message, in any view', async () => {
    await tid(window, 'message').fill(TEXT);
    for (let i = 0; i < 3; i += 1) await rightClickEditor(electronApp, window);
    await goTo(window, 'generate');
    await goTo(window, 'editor');
    await rightClickEditor(electronApp, window);
    await expect(tid(window, 'message')).toHaveValue(TEXT);
  });
});
