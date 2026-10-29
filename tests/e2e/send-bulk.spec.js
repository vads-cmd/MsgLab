const { test, expect } = require('@playwright/test');
const {
  waitForWindow, goTo, clearDirtyState,
  closeApp, takeScreenshotOnFailure, launchApp,
  configureBulkGeneration, generateBulk, waitForBulkDone,
  setSendHost, setSendPort, setSendRate, setSendDelayCustom, setSendStopOnError,
  clickSendBulkGo, clickSendBulkCancel, getSendBulkSummary, getSendBulkEstimate, getSendBulkStatus, getSendBulkStatusClass,
  isSendBulkResultsVisible, isSendBulkProgressVisible,
  getSendBulkRowCount, getSendBulkRowCell,
  isConfirmDialogOpen, clickConfirmYes, clickConfirmNo,
  getConfirmDialogTitle, getConfirmDialogText,
  isSendBulkGoDisabled, isSendBulkExportVisible,
  isSendBulkCancelVisible,
  tid,
} = require('./helpers');
const { startMockServer } = require('../support/mock-mllp-server');

// ---------------------------------------------------------------- UI structure

test.describe('Bulk send — UI structure', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;

  test.beforeEach(async () => {
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    await goTo(window, 'send');
    // Switch to Bulk send mode so the Bulk panel is visible
    await window.evaluate(() => {
      document.getElementById('send-mode-bulk').click();
    });
    await window.waitForTimeout(300);
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
  });

  test('shows the Bulk send controls with their defaults and no results yet', async () => {
    await expect.soft(tid(window, 'send-bulk-hint')).toContainText('Bulk tab');
    await expect.soft(tid(window, 'send-bulk-summary')).toContainText('no messages yet');
    await expect.soft(tid(window, 'send-bulk-estimate')).toHaveText('');
    await expect.soft(tid(window, 'send-rate')).toHaveValue('60');
    const options = await tid(window, 'send-rate').locator('option').allTextContents();
    for (const option of [
      '1 message per minute', '1 message every 30 seconds', '1 message every 10 seconds', '1 message every 5 seconds',
      '1 message per second', 'No pause (as fast as the ACKs arrive)', 'Custom...',
    ]) {
      expect.soft(options).toContain(option);
    }
    await expect.soft(tid(window, 'send-delay-custom-label')).toBeHidden();
    await expect.soft(tid(window, 'send-stop-on-error')).not.toBeChecked();
    await expect.soft(tid(window, 'send-bulk-go')).toBeDisabled();
    // nothing has run yet: these parts are in the page but not shown
    for (const id of ['send-bulk-cancel', 'send-bulk-export', 'send-bulk-progress', 'send-bulk-results']) {
      await expect.soft(tid(window, id)).toBeHidden();
    }
    for (const id of ['send-bulk-status', 'send-bulk-export-status']) await expect.soft(tid(window, id)).toBeAttached();
    for (const [column, text] of [['number', '#'], ['type', 'Type'], ['control-id', 'Control ID'], ['result', 'Result'], ['time', 'Time (ms)'], ['details', 'Details']]) {
      await expect.soft(tid(window, `send-col-${column}`)).toHaveText(text);
    }
    expect.soft(await isConfirmDialogOpen(window)).toBe(false);
  });

  test('custom delay label appears when Custom is selected', async () => {
    await setSendRate(window, 'custom');
    await window.waitForTimeout(300);
    // Check the hidden attribute directly
    const hidden = await tid(window, 'send-delay-custom-label').getAttribute('hidden');
    expect(hidden).toBe(null);
  });

  test('custom delay defaults to 60 seconds', async () => {
    await setSendRate(window, 'custom');
    expect(await tid(window, 'send-delay-custom').inputValue()).toBe('60');
  });

  test('Send all button is enabled after generating bulk messages', async () => {
    await configureBulkGeneration(window, { count: 5 });
    await generateBulk(window);
    await waitForBulkDone(window);
    await goTo(window, 'send');
    expect(await isSendBulkGoDisabled(window)).toBe(false);
  });

  test('estimate shows pace description after generating messages', async () => {
    await configureBulkGeneration(window, { count: 3 });
    await generateBulk(window);
    await waitForBulkDone(window);
    await goTo(window, 'send');
    const estimate = await getSendBulkEstimate(window);
    expect(estimate).toContain('message');
  });

  test('summary updates after generating bulk messages', async () => {
    await configureBulkGeneration(window, { count: 5 });
    await generateBulk(window);
    await waitForBulkDone(window);
    await goTo(window, 'send');
    const summary = await getSendBulkSummary(window);
    expect(summary).toContain('5');
    expect(summary).toContain('message');
  });

});

// ---------------------------------------------------------------- Confirm dialog

test.describe('Bulk send — Confirm dialog', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;

  test.beforeEach(async () => {
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    await configureBulkGeneration(window, { count: 3 });
    await generateBulk(window);
    await waitForBulkDone(window);
    await goTo(window, 'send');
    // Switch to Bulk send mode so the Bulk panel is visible
    await window.evaluate(() => {
      document.getElementById('send-mode-bulk').click();
    });
    await window.waitForTimeout(300);
    await setSendHost(window, '127.0.0.1');
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
  });

  test('shows confirm dialog on Send all click', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    expect(await isConfirmDialogOpen(window)).toBe(true);
  });

  test('confirm dialog title shows message count', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    const title = await getConfirmDialogTitle(window);
    expect(title).toContain('3');
    expect(title).toContain('message');
  });

  test('confirm dialog body shows target address', async () => {
    await setSendPort(window, '2575');
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    const text = await getConfirmDialogText(window);
    expect(text).toContain('127.0.0.1');
    expect(text).toContain('2575');
  });

  test('confirm dialog body shows pace description', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    const text = await getConfirmDialogText(window);
    expect(text).toContain('message every');
  });

  test('confirm dialog body shows stop-on-error behavior', async () => {
    await setSendStopOnError(window, true);
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    const text = await getConfirmDialogText(window);
    expect(text).toContain('stops at the first');
  });

  test('confirm dialog body shows continue-on-error by default', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    const text = await getConfirmDialogText(window);
    expect(text).toContain('goes on');
  });

  test('confirm dialog shows no validation errors for valid messages', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    const text = await getConfirmDialogText(window);
    // Valid messages should not show validation error line
    expect(text).not.toContain('validation errors');
  });

  test('Cancel button closes dialog without sending', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    await clickConfirmNo(window);
    expect(await isConfirmDialogOpen(window)).toBe(false);
    // No results should appear
    expect(await isSendBulkResultsVisible(window)).toBe(false);
  });

  test('error shown when host is empty', async () => {
    await setSendHost(window, '');
    await clickSendBulkGo(window);
    await window.waitForTimeout(1000);
    const status = await getSendBulkStatus(window);
    expect(status).toContain('host');
  });

});

// ---------------------------------------------------------------- Pace settings

test.describe('Bulk send — Pace settings', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;

  test.beforeEach(async () => {
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    await configureBulkGeneration(window, { count: 5 });
    await generateBulk(window);
    await waitForBulkDone(window);
    await goTo(window, 'send');
    // Switch to Bulk send mode so the Bulk panel is visible
    await window.evaluate(() => {
      document.getElementById('send-mode-bulk').click();
    });
    await window.waitForTimeout(300);
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
  });

  test('estimate changes when pace changes', async () => {
    const estimate1 = await getSendBulkEstimate(window);
    await setSendRate(window, '0');
    const estimate2 = await getSendBulkEstimate(window);
    expect(estimate2).toContain('No pause');
    expect(estimate1).not.toBe(estimate2);
  });

  test('estimate shows "as fast as the ACKs arrive" for no pause', async () => {
    await setSendRate(window, '0');
    const estimate = await getSendBulkEstimate(window);
    expect(estimate).toContain('ACK');
  });

  test('custom pace shows custom delay in estimate', async () => {
    await setSendRate(window, 'custom');
    await setSendDelayCustom(window, '5');
    const estimate = await getSendBulkEstimate(window);
    expect(estimate).toContain('5');
  });

  test('estimate shows duration for 30-second pace', async () => {
    await setSendRate(window, '30');
    const estimate = await getSendBulkEstimate(window);
    expect(estimate).toContain('30');
  });

  test('custom delay label hides when switching from Custom', async () => {
    await setSendRate(window, 'custom');
    await window.waitForTimeout(300);
    let hidden = await tid(window, 'send-delay-custom-label').getAttribute('hidden');
    expect(hidden).toBe(null);
    await setSendRate(window, '60');
    await window.waitForTimeout(300);
    hidden = await tid(window, 'send-delay-custom-label').getAttribute('hidden');
    expect(hidden).not.toBe(null);
  });
});

// ---------------------------------------------------------------- Actual bulk send

test.describe('Bulk send — Send messages', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;
  /** @type {{ host: string, port: number, close: () => Promise<void>, received: Array<{text: string}> }} */
  let mockServer;

  test.beforeEach(async () => {
    mockServer = await startMockServer({ mode: 'accept' });
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    // Generate 3 bulk messages
    await configureBulkGeneration(window, { count: 3 });
    await generateBulk(window);
    await waitForBulkDone(window);
    // Navigate to Send and configure
    await goTo(window, 'send');
    // Switch to Bulk send mode so the Bulk panel is visible
    await window.evaluate(() => {
      document.getElementById('send-mode-bulk').click();
    });
    await window.waitForTimeout(300);
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
    // Set no pause for speed
    await setSendRate(window, '0');
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
    await mockServer.close();
  });

  test('sends all messages and shows results', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    // Confirm dialog appears
    expect(await isConfirmDialogOpen(window)).toBe(true);
    await clickConfirmYes(window);
    // Wait for send to complete
    await window.waitForTimeout(10000);

    const status = await getSendBulkStatus(window);
    expect(status).toContain('Done');
    expect(status).toContain('3');
  });

  test('shows progress bar during send', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    await clickConfirmYes(window);
    // Progress bar should appear
    expect(await isSendBulkProgressVisible(window)).toBe(true);
    await window.waitForTimeout(5000);
  });

  test('shows results table after send completes', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    await clickConfirmYes(window);
    await window.waitForTimeout(10000);

    expect(await isSendBulkResultsVisible(window)).toBe(true);
    const rowCount = await getSendBulkRowCount(window);
    expect(rowCount).toBe(3);
  });

  test('result rows contain correct data', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    await clickConfirmYes(window);
    await window.waitForTimeout(10000);

    const number = await getSendBulkRowCell(window, 1, 'number');
    expect(number).toBe('1');
    const type = await getSendBulkRowCell(window, 1, 'type');
    expect(type).toContain('ADT');
    const result = await getSendBulkRowCell(window, 1, 'result');
    expect(result).toContain('Accepted');
  });

  test('server receives all messages', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    await clickConfirmYes(window);
    await window.waitForTimeout(10000);

    expect(mockServer.received.length).toBe(3);
  });

  test('status shows ok class on success', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    await clickConfirmYes(window);
    await window.waitForTimeout(10000);

    const cls = await getSendBulkStatusClass(window);
    expect(cls).toContain('ok');
  });

  test('Cancel button is hidden after send completes', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    await clickConfirmYes(window);
    await window.waitForTimeout(10000);

    expect(await isSendBulkCancelVisible(window)).toBe(false);
  });

  test('Send all button is enabled again after send completes', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    await clickConfirmYes(window);
    await window.waitForTimeout(10000);

    expect(await isSendBulkGoDisabled(window)).toBe(false);
  });

  test('Cancel button appears during send and Cancel stops the run', async () => {
    // Use a slow server to give time to check the cancel button
    await closeApp(electronApp);
    await mockServer.close();
    mockServer = await startMockServer({ mode: 'accept', delayMs: 2000 });
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    await configureBulkGeneration(window, { count: 3 });
    await generateBulk(window);
    await waitForBulkDone(window);
    await goTo(window, 'send');
    // Switch to Bulk send mode so the Bulk panel is visible
    await window.evaluate(() => {
      document.getElementById('send-mode-bulk').click();
    });
    await window.waitForTimeout(300);
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
    await setSendRate(window, '0');

    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    await clickConfirmYes(window);
    // Check cancel button appears during send
    expect(await isSendBulkCancelVisible(window)).toBe(true);
    // Cancel the send
    await clickSendBulkCancel(window);
    await expect(tid(window, 'send-bulk-status')).toContainText(/Cancelled after/, { timeout: 15000 });
    expect(await isSendBulkCancelVisible(window)).toBe(false);
    expect(await isSendBulkGoDisabled(window)).toBe(false);
    expect(mockServer.received.length).toBeLessThan(3);
  });
});

// ---------------------------------------------------------------- Stop on error

test.describe('Bulk send — Stop on error', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;
  /** @type {{ host: string, port: number, close: () => Promise<void> }} */
  let mockServer;

  test.beforeEach(async () => {
    // Reject the 2nd message
    mockServer = await startMockServer({ mode: (n) => (n === 2 ? 'reject' : 'accept') });
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    await configureBulkGeneration(window, { count: 3 });
    await generateBulk(window);
    await waitForBulkDone(window);
    await goTo(window, 'send');
    // Switch to Bulk send mode so the Bulk panel is visible
    await window.evaluate(() => {
      document.getElementById('send-mode-bulk').click();
    });
    await window.waitForTimeout(300);
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
    await setSendRate(window, '0');
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
    await mockServer.close();
  });

  test('stop on error stops at first rejected message', async () => {
    await setSendStopOnError(window, true);
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    await clickConfirmYes(window);
    await window.waitForTimeout(10000);

    const status = await getSendBulkStatus(window);
    expect(status).toContain('Stopped');
    // Only 2 messages should be sent (1 accepted, 1 rejected)
    const rowCount = await getSendBulkRowCount(window);
    expect(rowCount).toBe(2);
  });

  test('without stop on error, all messages are sent despite rejection', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    await clickConfirmYes(window);
    await window.waitForTimeout(10000);

    const status = await getSendBulkStatus(window);
    expect(status).toContain('Done');
    const rowCount = await getSendBulkRowCount(window);
    expect(rowCount).toBe(3);
  });

  test('status shows error class when some messages failed', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    await clickConfirmYes(window);
    await window.waitForTimeout(10000);

    const cls = await getSendBulkStatusClass(window);
    expect(cls).toContain('error');
  });

  test('failed row shows Rejected result', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    await clickConfirmYes(window);
    await window.waitForTimeout(10000);

    const result = await getSendBulkRowCell(window, 2, 'result');
    expect(result).toContain('Rejected');
  });
});

// ---------------------------------------------------------------- Connection failure

test.describe('Bulk send — Connection failure', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;

  test.beforeEach(async () => {
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    await configureBulkGeneration(window, { count: 2 });
    await generateBulk(window);
    await waitForBulkDone(window);
    await goTo(window, 'send');
    // Switch to Bulk send mode so the Bulk panel is visible
    await window.evaluate(() => {
      document.getElementById('send-mode-bulk').click();
    });
    await window.waitForTimeout(300);
    await setSendHost(window, '127.0.0.1');
    await setSendPort(window, '19999'); // No server listening
    await setSendRate(window, '0');
    // Set short timeout for faster test
    await window.evaluate(() => {
      document.getElementById('send-connect-timeout').value = '2';
    });
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
  });

  test('shows error when connection fails', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    await clickConfirmYes(window);
    await window.waitForTimeout(10000);

    const status = await getSendBulkStatus(window);
    expect(status.length > 0).toBe(true);
    const cls = await getSendBulkStatusClass(window);
    expect(cls).toContain('error');
  });
});

// ---------------------------------------------------------------- CSV Export

test.describe('Bulk send — CSV Export', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;
  /** @type {{ host: string, port: number, close: () => Promise<void> }} */
  let mockServer;

  test.beforeEach(async () => {
    mockServer = await startMockServer({ mode: 'accept' });
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    await configureBulkGeneration(window, { count: 2 });
    await generateBulk(window);
    await waitForBulkDone(window);
    await goTo(window, 'send');
    // Switch to Bulk send mode so the Bulk panel is visible
    await window.evaluate(() => {
      document.getElementById('send-mode-bulk').click();
    });
    await window.waitForTimeout(300);
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
    await setSendRate(window, '0');
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
    await mockServer.close();
  });

  test('export button appears after successful send', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    await clickConfirmYes(window);
    await window.waitForTimeout(10000);

    expect(await isSendBulkExportVisible(window)).toBe(true);
  });

  test('export button text is correct', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    await clickConfirmYes(window);
    await window.waitForTimeout(10000);

    const btnText = await tid(window, 'send-bulk-export').textContent();
    expect(btnText).toContain('CSV');
  });
});

// ---------------------------------------------------------------- Edge cases

test.describe('Bulk send — Edge cases', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;

  test.beforeEach(async () => {
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    await goTo(window, 'send');
    // Switch to Bulk send mode so the Bulk panel is visible
    await window.evaluate(() => {
      document.getElementById('send-mode-bulk').click();
    });
    await window.waitForTimeout(300);
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
  });

  test('single message shows "no pause" estimate', async () => {
    await configureBulkGeneration(window, { count: 1 });
    await generateBulk(window);
    await waitForBulkDone(window);
    await goTo(window, 'send');
    // Re-switch to Bulk mode after navigating from Bulk view
    await window.evaluate(() => {
      document.getElementById('send-mode-bulk').click();
    });
    await window.waitForTimeout(300);
    const estimate = await getSendBulkEstimate(window);
    expect(estimate).toContain('no pause');
  });

  test('bulk send card is visible in Send view', async () => {
    await expect(tid(window, 'send-card-bulk')).toBeVisible();
  });

  test('bulk send options row is visible', async () => {
    await expect(tid(window, 'send-bulk-options')).toBeVisible();
  });

  test('bulk send actions row is visible', async () => {
    await expect(tid(window, 'send-bulk-actions')).toBeVisible();
  });
});
