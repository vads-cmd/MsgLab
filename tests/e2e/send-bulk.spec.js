const { test, expect } = require('@playwright/test');
const {
  HL7_MESSAGES, waitForWindow, pasteMessage, goTo, clearDirtyState,
  closeApp, takeScreenshotOnFailure, launchApp,
  configureBulkGeneration, generateBulk, waitForBulkDone,
  setSendHost, setSendPort, setSendRate, setSendDelayCustom, setSendStopOnError,
  clickSendBulkGo, clickSendBulkCancel, clickSendBulkExport,
  getSendBulkSummary, getSendBulkEstimate, getSendBulkStatus, getSendBulkStatusClass,
  getSendBulkExportStatus,
  isSendBulkResultsVisible, isSendBulkProgressVisible,
  getSendBulkRowCount, getSendBulkRowCell,
  isConfirmDialogOpen, clickConfirmYes, clickConfirmNo,
  getConfirmDialogTitle, getConfirmDialogText,
  isCustomDelayLabelVisible, isSendBulkGoDisabled, isSendBulkExportVisible,
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
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
  });

  test('shows Bulk send card with legend', async () => {
    expect(await tid(window, 'send-card-bulk-title').textContent()).toBe('Bulk send');
  });

  test('shows bulk send hint text', async () => {
    const hint = await tid(window, 'send-bulk-hint').textContent();
    expect(hint).toContain('Bulk tab');
  });

  test('shows empty summary when no bulk messages', async () => {
    const summary = await getSendBulkSummary(window);
    expect(summary).toContain('no messages yet');
  });

  test('has pace dropdown with default 1 per minute', async () => {
    await expect(tid(window, 'send-rate')).toBeVisible();
    expect(await tid(window, 'send-rate').inputValue()).toBe('60');
  });

  test('has all pace options', async () => {
    const options = await window.locator('#send-rate option').allTextContents();
    expect(options).toContain('1 message per minute');
    expect(options).toContain('1 message every 30 seconds');
    expect(options).toContain('1 message every 10 seconds');
    expect(options).toContain('1 message every 5 seconds');
    expect(options).toContain('1 message per second');
    expect(options).toContain('No pause (as fast as the ACKs arrive)');
    expect(options).toContain('Custom...');
  });

  test('custom delay label is hidden by default', async () => {
    const hidden = await tid(window, 'send-delay-custom-label').getAttribute('hidden');
    expect(hidden).not.toBe(null);
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

  test('has stop on error checkbox', async () => {
    await expect(tid(window, 'send-stop-on-error')).toBeVisible();
  });

  test('stop on error is unchecked by default', async () => {
    expect(await tid(window, 'send-stop-on-error').isChecked()).toBe(false);
  });

  test('has Send all button', async () => {
    await expect(tid(window, 'send-bulk-go')).toBeVisible();
  });

  test('Send all button is disabled with no bulk messages', async () => {
    expect(await isSendBulkGoDisabled(window)).toBe(true);
  });

  test('Send all button is enabled after generating bulk messages', async () => {
    await configureBulkGeneration(window, { count: 5 });
    await generateBulk(window);
    await waitForBulkDone(window);
    await goTo(window, 'send');
    expect(await isSendBulkGoDisabled(window)).toBe(false);
  });

  test('Cancel button is hidden initially', async () => {
    expect(await isSendBulkCancelVisible(window)).toBe(false);
  });

  test('Save report button is hidden initially', async () => {
    expect(await isSendBulkExportVisible(window)).toBe(false);
  });

  test('progress bar is hidden initially', async () => {
    expect(await isSendBulkProgressVisible(window)).toBe(false);
  });

  test('results table is hidden initially', async () => {
    expect(await isSendBulkResultsVisible(window)).toBe(false);
  });

  test('has results table with correct columns', async () => {
    expect(await tid(window, 'send-col-number').textContent()).toBe('#');
    expect(await tid(window, 'send-col-type').textContent()).toBe('Type');
    expect(await tid(window, 'send-col-control-id').textContent()).toBe('Control ID');
    expect(await tid(window, 'send-col-result').textContent()).toBe('Result');
    expect(await tid(window, 'send-col-time').textContent()).toBe('Time (ms)');
    expect(await tid(window, 'send-col-details').textContent()).toBe('Details');
  });

  test('has status output elements', async () => {
    expect(await tid(window, 'send-bulk-status').count()).toBe(1);
    expect(await tid(window, 'send-bulk-export-status').count()).toBe(1);
  });

  test('estimate is empty when no messages', async () => {
    const estimate = await getSendBulkEstimate(window);
    expect(estimate).toBe('');
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

  test('confirm dialog is hidden initially', async () => {
    expect(await isConfirmDialogOpen(window)).toBe(false);
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

  test('Send all button is disabled when no bulk messages', async () => {
    // Launch fresh app without generating bulk messages
    await closeApp(electronApp);
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    await goTo(window, 'send');
    // Button should be disabled with no bulk messages
    expect(await isSendBulkGoDisabled(window)).toBe(true);
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

  test('Save report button appears after send', async () => {
    await clickSendBulkGo(window);
    await window.waitForTimeout(500);
    await clickConfirmYes(window);
    await window.waitForTimeout(10000);

    expect(await isSendBulkExportVisible(window)).toBe(true);
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

  test('Cancel button appears during send', async () => {
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
    await window.waitForTimeout(3000);
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

  test('export button is hidden before any send', async () => {
    expect(await isSendBulkExportVisible(window)).toBe(false);
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
