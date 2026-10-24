const { test, expect, _electron: electron } = require('@playwright/test');
const { HL7_MESSAGES, waitForWindow, pasteMessage, configureBulkGeneration, getMessageText } = require('./helpers');

test.describe('Clipboard Operations', () => {
  let electronApp;
  let window;

  test.beforeEach(async () => {
    electronApp = await electron.launch({ args: ['.'] });
    window = await waitForWindow(electronApp);
  });

  test.afterEach(async () => {
    await require("./helpers").closeApp(electronApp);
  });

  test('copies generated message to clipboard via bulk copy', async () => {
    // Generate bulk messages first
    await configureBulkGeneration(window, { count: 3 });
    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);

    // Click copy button
    await window.click('#bulk-copy');
    await window.waitForTimeout(500);

    // Check copy status
    const copyStatus = await window.locator('#bulk-copy-status').textContent();
    expect(copyStatus).toContain('Copied');
  });

  test('shows copy status after bulk copy', async () => {
    await configureBulkGeneration(window, { count: 5 });
    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);

    await window.click('#bulk-copy');
    await window.waitForTimeout(500);

    const copyStatus = await window.locator('#bulk-copy-status').textContent();
    expect(copyStatus).toContain('message');
  });

  test('copy button is visible after bulk generation', async () => {
    await configureBulkGeneration(window, { count: 3 });
    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);

    const copyButton = await window.locator('#bulk-copy').isVisible();
    expect(copyButton).toBe(true);
  });

  test('copy button text is correct', async () => {
    await configureBulkGeneration(window, { count: 3 });
    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);

    const copyButtonText = await window.locator('#bulk-copy').textContent();
    expect(copyButtonText).toBe('Copy all messages');
  });

  test('pastes message and copies via bulk', async () => {
    // Paste a message first
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await window.waitForTimeout(500);

    // Generate bulk messages
    await configureBulkGeneration(window, { count: 2 });
    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);

    // Copy all
    await window.click('#bulk-copy');
    await window.waitForTimeout(500);

    const copyStatus = await window.locator('#bulk-copy-status').textContent();
    expect(copyStatus).toContain('Copied');
  });

  test('copy status clears on new generation', async () => {
    // First generation and copy
    await configureBulkGeneration(window, { count: 3 });
    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);
    await window.click('#bulk-copy');
    await window.waitForTimeout(500);

    // New generation should clear copy status
    await configureBulkGeneration(window, { count: 2 });
    await window.click('#bulk-generate');
    await window.waitForTimeout(2000);

    const copyStatus = await window.locator('#bulk-copy-status').textContent();
    expect(copyStatus).toBe('');
  });
});
