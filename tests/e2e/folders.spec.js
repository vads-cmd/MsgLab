const { test, expect } = require('@playwright/test');
const {
  waitForWindow, clearDirtyState, closeApp, tid, goTo,
  launchApp, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('Default Folders', () => {
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

  test('shows the folders card with both folder rows', async () => {
    await goTo(window, 'settings');
    await expect.soft(tid(window, 'settings-card-folders')).toBeVisible();
    await expect.soft(tid(window, 'settings-card-folders-title')).toContainText('Default folders');
    await expect.soft(tid(window, 'settings-folders-hint')).toContainText('Save');
    await expect.soft(tid(window, 'folder-status')).toBeAttached();
    for (const [kind, label] of [['save', 'Saving'], ['export', 'Exporting']]) {
      await expect.soft(tid(window, `folder-${kind}-row`)).toBeVisible();
      await expect.soft(tid(window, `folder-${kind}-label`)).toContainText(label);
      await expect.soft(tid(window, `folder-${kind}`)).toBeVisible();
      await expect.soft(tid(window, `folder-${kind}-choose`)).toContainText('Choose');
      await expect.soft(tid(window, `folder-${kind}-clear`)).toContainText('Clear');
    }
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
