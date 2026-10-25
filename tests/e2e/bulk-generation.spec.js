const { test, expect } = require('@playwright/test');
const {
  waitForWindow, configureBulkGeneration, generateBulk, getBulkStatus,
  getBulkSummary, getBulkRowCount, getBulkRowType, getBulkRowPatient,
  getBulkRowTime, getBulkRowControlId,
  selectAllBulkTypes, selectNoBulkTypes,
  clearDirtyState, closeApp, tid,
  launchApp, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('Bulk Generation', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;

  test.beforeEach(async () => {
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    // Clear dirty state so the unsaved-changes modal never blocks this test
    await clearDirtyState(window);
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
  });

  test('opens the bulk generation view', async () => {
    // Open the Bulk view from the sidebar
    await window.click('[data-testid="nav-bulk"]');
    await window.waitForTimeout(200);

    // The bulk form should be visible
    const bulkForm = tid(window, 'bulk-form');
    await expect(bulkForm).toBeVisible();
  });

  test('generates 5 messages', async () => {
    await configureBulkGeneration(window, { count: 5 });

    // Submit the bulk form
    await generateBulk(window);

    // Check status
    const status = await getBulkStatus(window);
    expect(status).toBe('Done');

    // Check results are shown
    const result = tid(window, 'bulk-result');
    await expect(result).toBeVisible();
  });

  test('generates 10 messages with default settings', async () => {
    await configureBulkGeneration(window, { count: 10 });

    await generateBulk(window);

    const status = await getBulkStatus(window);
    expect(status).toBe('Done');

    // Check summary contains message count
    const summary = await getBulkSummary(window);
    expect(summary).toContain('message');
  });

  test('shows results table with rows', async () => {
    await configureBulkGeneration(window, { count: 5 });

    await generateBulk(window);

    // Check table rows using data-testid prefix
    const rows = await getBulkRowCount(window);
    expect(rows).toBe(5);
  });

  test('shows message types in results table', async () => {
    await configureBulkGeneration(window, { count: 3 });

    await generateBulk(window);

    // Each row should have a type
    const rows = await getBulkRowCount(window);
    expect(rows).toBe(3);

    // First row should have a type
    const type = await getBulkRowType(window, 1);
    expect(type).toBeTruthy();
  });

  test('shows patient info in results table', async () => {
    await configureBulkGeneration(window, { count: 3 });

    await generateBulk(window);

    // Check that patient column has content
    const patient = await getBulkRowPatient(window, 1);
    expect(patient).toBeTruthy();
  });

  test('generates with journey mode', async () => {
    await configureBulkGeneration(window, { count: 5, mode: 'journey' });

    await generateBulk(window);

    const status = await getBulkStatus(window);
    expect(status).toBe('Done');
  });

  test('generates with different minutes between messages', async () => {
    await configureBulkGeneration(window, { count: 5, minutes: 10 });

    await generateBulk(window);

    const status = await getBulkStatus(window);
    expect(status).toBe('Done');
  });

  test('shows copy all button', async () => {
    await configureBulkGeneration(window, { count: 3 });

    await generateBulk(window);

    const copyButton = tid(window, 'bulk-copy');
    await expect(copyButton).toBeVisible();
    const text = await copyButton.textContent();
    expect(text).toBe('Copy all messages');
  });

  test('generates single message', async () => {
    await configureBulkGeneration(window, { count: 1 });

    await generateBulk(window);

    const status = await getBulkStatus(window);
    expect(status).toBe('Done');

    const rows = await getBulkRowCount(window);
    expect(rows).toBe(1);
  });

  test('bulk generation uses selected message type', async () => {
    // Open the Bulk view
    await window.click('[data-testid="nav-bulk"]');
    await window.waitForTimeout(200);

    // Uncheck ADT^A01 and check ADT^A02
    const a01Checkbox = window.locator('#bulk-types input[value="ADT^A01"]');
    if (await a01Checkbox.isChecked()) {
      await a01Checkbox.click();
    }
    const a02Checkbox = window.locator('#bulk-types input[value="ADT^A02"]');
    if (!(await a02Checkbox.isChecked())) {
      await a02Checkbox.click();
    }

    // Set count
    await tid(window, 'bulk-count').fill('3');

    await generateBulk(window);

    const status = await getBulkStatus(window);
    expect(status).toBe('Done');
  });

  test('shows seed in summary', async () => {
    await configureBulkGeneration(window, { count: 3 });

    await generateBulk(window);

    const summary = await getBulkSummary(window);
    expect(summary).toContain('seed');
  });

  test('select all types button works', async () => {
    await window.click('[data-testid="nav-bulk"]');
    await window.waitForTimeout(200);

    // First deselect all
    await selectNoBulkTypes(window);
    const noneChecked = await window.locator('#bulk-types input:checked').count();
    expect(noneChecked).toBe(0);

    // Then select all
    await selectAllBulkTypes(window);
    const allChecked = await window.locator('#bulk-types input:checked').count();
    expect(allChecked).toBeGreaterThan(0);
  });

  test('bulk result shows row details', async () => {
    await configureBulkGeneration(window, { count: 3 });

    await generateBulk(window);

    // Verify row 1 has all columns populated
    const type = await getBulkRowType(window, 1);
    const patient = await getBulkRowPatient(window, 1);
    const time = await getBulkRowTime(window, 1);
    const controlId = await getBulkRowControlId(window, 1);

    expect(type).toBeTruthy();
    expect(patient).toBeTruthy();
    expect(time).toBeTruthy();
    expect(controlId).toBeTruthy();
  });

  test('export options are visible after generation', async () => {
    await configureBulkGeneration(window, { count: 3 });

    await generateBulk(window);

    // Export mode dropdown should be visible
    const exportMode = tid(window, 'export-mode');
    await expect(exportMode).toBeVisible();

    // Export button should be visible
    const exportRun = tid(window, 'export-run');
    await expect(exportRun).toBeVisible();
  });

  test('bulk table has column headers', async () => {
    await configureBulkGeneration(window, { count: 3 });

    await generateBulk(window);

    // Column headers should be visible
    await expect(tid(window, 'bulk-col-num')).toBeVisible();
    await expect(tid(window, 'bulk-col-type')).toBeVisible();
    await expect(tid(window, 'bulk-col-patient')).toBeVisible();
    await expect(tid(window, 'bulk-col-time')).toBeVisible();
    await expect(tid(window, 'bulk-col-control-id')).toBeVisible();
  });
});
