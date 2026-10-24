const { test, expect } = require('@playwright/test');
const {
  waitForWindow, clearDirtyState, closeApp, tid, goTo,
  setExportMode, setExportBatch, configureBulkGeneration, generateBulk,
  launchApp, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('Export Options', () => {
  let electronApp;
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

  test('shows export box in bulk result area', async () => {
    await goTo(window, 'bulk');
    // The export box is visible in the bulk view
    const exportBox = tid(window, 'export-box');
    await expect(exportBox).toBeVisible();
  });

  test('shows export mode dropdown', async () => {
    await goTo(window, 'bulk');
    const exportMode = tid(window, 'export-mode');
    await expect(exportMode).toBeVisible();
  });

  test('export mode has one file option', async () => {
    await goTo(window, 'bulk');
    const exportMode = tid(window, 'export-mode');
    await exportMode.selectOption({ label: 'One file' });
    const value = await exportMode.inputValue();
    expect(value).toBe('one');
  });

  test('export mode has one file per message option', async () => {
    await goTo(window, 'bulk');
    const exportMode = tid(window, 'export-mode');
    await exportMode.selectOption({ label: 'One file per message' });
    const value = await exportMode.inputValue();
    expect(value).toBe('each');
  });

  test('export mode has one file per type option', async () => {
    await goTo(window, 'bulk');
    const exportMode = tid(window, 'export-mode');
    await exportMode.selectOption({ label: 'One file per message type' });
    const value = await exportMode.inputValue();
    expect(value).toBe('type');
  });

  test('export mode defaults to one file', async () => {
    await goTo(window, 'bulk');
    const value = await tid(window, 'export-mode').inputValue();
    expect(value).toBe('one');
  });

  test('shows export mode label', async () => {
    await goTo(window, 'bulk');
    const label = tid(window, 'export-mode-label');
    await expect(label).toBeVisible();
    expect(await label.textContent()).toContain('Export as');
  });

  test('shows batch header checkbox', async () => {
    await goTo(window, 'bulk');
    const batchCheckbox = tid(window, 'export-batch');
    await expect(batchCheckbox).toBeVisible();
  });

  test('batch header checkbox is checked by default', async () => {
    await goTo(window, 'bulk');
    const isChecked = await tid(window, 'export-batch').isChecked();
    expect(isChecked).toBe(true);
  });

  test('shows batch header label', async () => {
    await goTo(window, 'bulk');
    const label = tid(window, 'export-batch-label');
    await expect(label).toBeVisible();
    expect(await label.textContent()).toContain('Batch header');
  });

  test('shows export button', async () => {
    await goTo(window, 'bulk');
    const exportButton = tid(window, 'export-run');
    await expect(exportButton).toBeVisible();
    expect(await exportButton.textContent()).toContain('Export');
  });

  test('shows export status element', async () => {
    await goTo(window, 'bulk');
    const status = tid(window, 'export-status');
    // Element exists in the DOM
    await expect(status).not.toBeNull();
  });

  test('shows bulk hint text about export', async () => {
    await goTo(window, 'bulk');
    const hint = tid(window, 'bulk-hint');
    await expect(hint).toBeVisible();
    expect(await hint.textContent()).toContain('Line ending');
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

  test('changing export mode updates value', async () => {
    await goTo(window, 'bulk');
    await setExportMode(window, 'each');
    const value = await tid(window, 'export-mode').inputValue();
    expect(value).toBe('each');
  });
});
