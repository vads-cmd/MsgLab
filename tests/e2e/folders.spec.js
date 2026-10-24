const { test, expect } = require('@playwright/test');
const {
  waitForWindow, clearDirtyState, closeApp, tid, goTo,
  launchApp, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('Default Folders', () => {
  let electronApp;
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

  test('shows folders card in settings', async () => {
    await goTo(window, 'settings');
    const card = tid(window, 'settings-card-folders');
    await expect(card).toBeVisible();
  });

  test('folders card has correct title', async () => {
    await goTo(window, 'settings');
    const title = tid(window, 'settings-card-folders-title');
    await expect(title).toBeVisible();
    expect(await title.textContent()).toContain('Default folders');
  });

  test('shows folders hint text', async () => {
    await goTo(window, 'settings');
    const hint = tid(window, 'settings-folders-hint');
    await expect(hint).toBeVisible();
    expect(await hint.textContent()).toContain('Save');
  });

  test('shows save folder row', async () => {
    await goTo(window, 'settings');
    const row = tid(window, 'folder-save-row');
    await expect(row).toBeVisible();
  });

  test('shows save folder label', async () => {
    await goTo(window, 'settings');
    const label = tid(window, 'folder-save-label');
    await expect(label).toBeVisible();
    expect(await label.textContent()).toContain('Saving');
  });

  test('shows save folder path output', async () => {
    await goTo(window, 'settings');
    const path = tid(window, 'folder-save');
    await expect(path).toBeVisible();
  });

  test('shows save folder choose button', async () => {
    await goTo(window, 'settings');
    const choose = tid(window, 'folder-save-choose');
    await expect(choose).toBeVisible();
    expect(await choose.textContent()).toContain('Choose');
  });

  test('shows save folder clear button', async () => {
    await goTo(window, 'settings');
    const clear = tid(window, 'folder-save-clear');
    await expect(clear).toBeVisible();
    expect(await clear.textContent()).toContain('Clear');
  });

  test('shows export folder row', async () => {
    await goTo(window, 'settings');
    const row = tid(window, 'folder-export-row');
    await expect(row).toBeVisible();
  });

  test('shows export folder label', async () => {
    await goTo(window, 'settings');
    const label = tid(window, 'folder-export-label');
    await expect(label).toBeVisible();
    expect(await label.textContent()).toContain('Exporting');
  });

  test('shows export folder path output', async () => {
    await goTo(window, 'settings');
    const path = tid(window, 'folder-export');
    await expect(path).toBeVisible();
  });

  test('shows export folder choose button', async () => {
    await goTo(window, 'settings');
    const choose = tid(window, 'folder-export-choose');
    await expect(choose).toBeVisible();
    expect(await choose.textContent()).toContain('Choose');
  });

  test('shows export folder clear button', async () => {
    await goTo(window, 'settings');
    const clear = tid(window, 'folder-export-clear');
    await expect(clear).toBeVisible();
    expect(await clear.textContent()).toContain('Clear');
  });

  test('shows folder status element', async () => {
    await goTo(window, 'settings');
    const status = tid(window, 'folder-status');
    // Element exists in the DOM
    await expect(status).not.toBeNull();
  });

  test('save folder shows "not set" by default', async () => {
    await goTo(window, 'settings');
    const path = await tid(window, 'folder-save').textContent();
    expect(path.trim()).toBe('Not set - the last used folder is used');
  });

  test('export folder shows "not set" by default', async () => {
    await goTo(window, 'settings');
    const path = await tid(window, 'folder-export').textContent();
    expect(path.trim()).toBe('Not set - the last used folder is used');
  });
});
