const { test, expect } = require('@playwright/test');
const {
  waitForWindow, clearDirtyState, closeApp, tid, goTo,
  setExportBatch, configureBulkGeneration, generateBulk,
  launchApp, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('Export Options', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;

  test.beforeEach(async () => {
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    // The export options appear with the result list, so make one first
    await configureBulkGeneration(window, { count: 2 });
    await generateBulk(window);
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
  });

  test('shows the export box with its defaults', async () => {
    await goTo(window, 'bulk');
    await expect.soft(tid(window, 'export-box')).toBeVisible();
    await expect.soft(tid(window, 'export-mode-label')).toContainText('Export as');
    await expect.soft(tid(window, 'export-mode')).toHaveValue('one');
    await expect.soft(tid(window, 'export-batch-label')).toContainText('Batch header');
    await expect.soft(tid(window, 'export-batch')).toBeChecked();
    await expect.soft(tid(window, 'export-run')).toContainText('Export');
    await expect.soft(tid(window, 'export-status')).toBeAttached();
    await expect.soft(tid(window, 'bulk-hint')).toContainText('Line ending');
  });

  test('export mode can be set to each of its three options', async () => {
    await goTo(window, 'bulk');
    for (const [label, value] of [['One file', 'one'], ['One file per message', 'each'], ['One file per message type', 'type']]) {
      await tid(window, 'export-mode').selectOption({ label });
      await expect.soft(tid(window, 'export-mode')).toHaveValue(value);
    }
  });

  test('toggling batch header changes checkbox state', async () => {
    await goTo(window, 'bulk');
    await setExportBatch(window, false);
    const unchecked = await tid(window, 'export-batch').isChecked();
    expect(unchecked).toBe(false);
    await setExportBatch(window, true);
    const checked = await tid(window, 'export-batch').isChecked();
    expect(checked).toBe(true);
  });

});
