const { test, expect } = require('@playwright/test');
const {
  HL7_MESSAGES, waitForWindow, pasteMessage, configureBulkGeneration,
  generateBulk, copyBulkAll, getBulkCopyStatus,
  clearDirtyState, closeApp, tid,
  launchApp, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('Clipboard Operations', () => {
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

  test('copies generated message to clipboard via bulk copy', async () => {
    // Generate bulk messages first
    await configureBulkGeneration(window, { count: 3 });
    await generateBulk(window);

    // Click copy button
    await copyBulkAll(window);

    // Check copy status
    const copyStatus = await getBulkCopyStatus(window);
    expect(copyStatus).toContain('Copied');
  });

  test('shows copy status after bulk copy', async () => {
    await configureBulkGeneration(window, { count: 5 });
    await generateBulk(window);

    await copyBulkAll(window);

    const copyStatus = await getBulkCopyStatus(window);
    expect(copyStatus).toContain('message');
  });

  test('copy button is visible after bulk generation', async () => {
    await configureBulkGeneration(window, { count: 3 });
    await generateBulk(window);

    const copyButton = tid(window, 'bulk-copy');
    await expect(copyButton).toBeVisible();
  });

  test('copy button text is correct', async () => {
    await configureBulkGeneration(window, { count: 3 });
    await generateBulk(window);

    const copyButtonText = await tid(window, 'bulk-copy').textContent();
    expect(copyButtonText).toBe('Copy all messages');
  });

  test('pastes message and copies via bulk', async () => {
    // Paste a message first
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);

    // Generate bulk messages
    await configureBulkGeneration(window, { count: 2 });
    await generateBulk(window);

    // Copy all
    await copyBulkAll(window);

    const copyStatus = await getBulkCopyStatus(window);
    expect(copyStatus).toContain('Copied');
  });

  test('copy status clears on new generation', async () => {
    // First generation and copy
    await configureBulkGeneration(window, { count: 3 });
    await generateBulk(window);
    await copyBulkAll(window);

    // New generation should clear copy status
    await configureBulkGeneration(window, { count: 2 });
    await generateBulk(window);

    const copyStatus = await getBulkCopyStatus(window);
    expect(copyStatus).toBe('');
  });
});
