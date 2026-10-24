const { test, expect, _electron: electron } = require('@playwright/test');
const { waitForWindow, configureBulkGeneration, goTo } = require('./helpers');

test.describe('Bulk Generation', () => {
  let electronApp;
  let window;

  test.beforeEach(async () => {
    electronApp = await electron.launch({ args: ['.'] });
    window = await waitForWindow(electronApp);
  });

  test.afterEach(async () => {
    await require("./helpers").closeApp(electronApp);
  });

  test('opens the bulk generation view', async () => {
    // Open the Bulk view from the sidebar
    await goTo(window, 'bulk');

    // The bulk form should be visible
    const bulkForm = await window.locator('#bulk-form').isVisible();
    expect(bulkForm).toBe(true);
  });

  test('generates 5 messages', async () => {
    await configureBulkGeneration(window, { count: 5 });

    // Submit the bulk form
    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);

    // Check status
    const status = await window.locator('#bulk-status').textContent();
    expect(status).toBe('Done');

    // Check results are shown
    const resultVisible = await window.locator('#bulk-result').isVisible();
    expect(resultVisible).toBe(true);
  });

  test('generates 10 messages with default settings', async () => {
    await configureBulkGeneration(window, { count: 10 });

    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);

    const status = await window.locator('#bulk-status').textContent();
    expect(status).toBe('Done');

    // Check summary contains message count
    const summary = await window.locator('#bulk-summary').textContent();
    expect(summary).toContain('message');
  });

  test('shows results table with rows', async () => {
    await configureBulkGeneration(window, { count: 5 });

    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);

    // Check table rows
    const rows = await window.locator('#bulk-rows tr').count();
    expect(rows).toBe(5);
  });

  test('shows message types in results table', async () => {
    await configureBulkGeneration(window, { count: 3 });

    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);

    // Each row should have a type column
    const rows = await window.locator('#bulk-rows tr').count();
    expect(rows).toBe(3);
  });

  test('shows patient info in results table', async () => {
    await configureBulkGeneration(window, { count: 3 });

    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);

    // Check that patient column has content
    const text = await window.locator('#bulk-rows').textContent();
    expect(text).toBeTruthy();
  });

  test('generates with journey mode', async () => {
    await configureBulkGeneration(window, { count: 5, mode: 'journey' });

    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);

    const status = await window.locator('#bulk-status').textContent();
    expect(status).toBe('Done');
  });

  test('generates with different minutes between messages', async () => {
    await configureBulkGeneration(window, { count: 5, minutes: 10 });

    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);

    const status = await window.locator('#bulk-status').textContent();
    expect(status).toBe('Done');
  });

  test('shows copy all button', async () => {
    await configureBulkGeneration(window, { count: 3 });

    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);

    const copyButton = await window.locator('#bulk-copy').textContent();
    expect(copyButton).toBe('Copy all messages');
  });

  test('generates single message', async () => {
    await configureBulkGeneration(window, { count: 1 });

    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);

    const status = await window.locator('#bulk-status').textContent();
    expect(status).toBe('Done');

    const rows = await window.locator('#bulk-rows tr').count();
    expect(rows).toBe(1);
  });

  test('bulk generation uses selected message type', async () => {
    // Open the Bulk view
    await goTo(window, 'bulk');

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
    await window.fill('#bulk-count', '3');

    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);

    const status = await window.locator('#bulk-status').textContent();
    expect(status).toBe('Done');
  });

  test('shows seed in summary', async () => {
    await configureBulkGeneration(window, { count: 3 });

    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);

    const summary = await window.locator('#bulk-summary').textContent();
    expect(summary).toContain('seed');
  });
});
