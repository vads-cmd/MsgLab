// Retry settings: Settings > Sending (tries again, and also after AE/AR) and what they do when sending.
// Each test starts its own app on its own data folder.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const {
  HL7_MESSAGES, waitForWindow, pasteMessage, goTo, clearDirtyState, closeApp, takeScreenshotOnFailure, launchApp,
  makeTempDir, removeTempDir, configureBulkGeneration, generateBulk, waitForBulkDone,
  setRetryCount, getRetryCount, setRetryOnNack, isRetryOnNackChecked,
  setSendHost, setSendPort, setSendMode, setSendRate, clickSendGo, clickSendBulkGo, clickConfirmYes, isConfirmDialogOpen,
  tid,
} = require('./helpers');
const { startMockServer } = require('../support/mock-mllp-server');

// ---------------------------------------------------------------- The settings

test.describe('Retry settings', () => {
  let dataDir;
  let electronApp;
  let window;

  const start = async () => {
    electronApp = await launchApp({ userDataDir: dataDir });
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    await goTo(window, 'settings');
  };

  test.beforeEach(async () => {
    dataDir = makeTempDir();
    await start();
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await takeScreenshotOnFailure(window, testInfo);
    await closeApp(electronApp);
    removeTempDir(dataDir);
  });

  test('the Sending card shows both controls with their defaults and explanations', async () => {
    await expect.soft(tid(window, 'settings-card-sending')).toBeVisible();
    await expect.soft(tid(window, 'settings-card-sending-title')).toHaveText('Sending');
    await expect.soft(tid(window, 'settings-sending-hint')).toContainText('server does not answer');
    await expect.soft(tid(window, 'settings-sending-row')).toBeVisible();
    await expect.soft(tid(window, 'retry-count-label')).toContainText('Tries again');
    const count = tid(window, 'retry-count');
    await expect.soft(count).toHaveValue('0');
    await expect.soft(count).toHaveAttribute('min', '0');
    await expect.soft(count).toHaveAttribute('max', '5');
    await expect.soft(count).toHaveAttribute('step', '1');
    await expect.soft(count).toHaveAttribute('inputmode', 'numeric');
    await expect.soft(tid(window, 'retry-on-nack-label')).toContainText('Also try again after AE or AR');
    await expect.soft(tid(window, 'retry-on-nack')).not.toBeChecked();
    await expect.soft(tid(window, 'retry-hint')).toContainText('0 means a message is sent once');
    await expect.soft(tid(window, 'retry-hint')).toContainText('2 seconds between tries');
    await expect.soft(tid(window, 'retry-hint')).toContainText('duplicate');
  });

  test('both controls can be changed, and changed back', async () => {
    await setRetryCount(window, 5);
    await setRetryOnNack(window, true);
    expect.soft(await getRetryCount(window)).toBe(5);
    expect.soft(await isRetryOnNackChecked(window)).toBe(true);
    await setRetryCount(window, 0);
    await setRetryOnNack(window, false);
    expect.soft(await getRetryCount(window)).toBe(0);
    expect.soft(await isRetryOnNackChecked(window)).toBe(false);
  });

  test('the settings are written to settings.json and come back after a restart', async () => {
    await setRetryCount(window, 3);
    await setRetryOnNack(window, true);
    // the file is written a moment after the change: wait for it instead of a fixed time
    const stored = () => {
      try {
        const { controls } = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
        return [controls['retry-count'], controls['retry-on-nack']];
      } catch {
        return null;
      }
    };
    await expect.poll(stored).toEqual(['3', true]);

    await closeApp(electronApp, { keepData: true });
    await start();
    expect.soft(await getRetryCount(window)).toBe(3);
    expect.soft(await isRetryOnNackChecked(window)).toBe(true);
  });
});

// ---------------------------------------------------------------- What they do

test.describe('Retry settings — sending', () => {
  let electronApp;
  let window;
  let server;

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await takeScreenshotOnFailure(window, testInfo);
    await closeApp(electronApp);
    await server?.close();
    server = undefined;
  });

  /** Start the app with the retry settings, a message in the editor and a mock server that answers by `mode`. */
  const begin = async (mode, { retries = 0, onNack = false } = {}) => {
    server = await startMockServer({ mode });
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    await goTo(window, 'settings');
    await setRetryCount(window, retries);
    await setRetryOnNack(window, onNack);
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
    await setSendHost(window, server.host);
    await setSendPort(window, server.port);
  };

  test('without retries a send that gets no answer fails after one try', async () => {
    await begin((n) => (n === 1 ? 'close' : 'accept'));
    await clickSendGo(window);
    await expect(tid(window, 'send-status')).toHaveClass(/error/);
    expect(server.received).toHaveLength(1);
  });

  test('a send that gets no answer is tried again, and the status says how many tries it took', async () => {
    await begin((n) => (n === 1 ? 'close' : 'accept'), { retries: 2 });
    await clickSendGo(window);
    await expect(tid(window, 'send-status')).toContainText('tried 2 times', { timeout: 15000 });
    await expect(tid(window, 'send-status')).toHaveClass(/ok/);
    expect(server.received).toHaveLength(2);
  });

  test('a refused message (AE) is not tried again by default', async () => {
    await begin((n) => (n === 1 ? 'error' : 'accept'), { retries: 2 });
    await clickSendGo(window);
    await expect(tid(window, 'send-status')).toContainText('AE');
    await expect(tid(window, 'send-status')).toHaveClass(/error/);
    expect(server.received).toHaveLength(1);
  });

  test('a refused message (AE) is tried again when the box is checked', async () => {
    await begin((n) => (n === 1 ? 'error' : 'accept'), { retries: 2, onNack: true });
    await clickSendGo(window);
    await expect(tid(window, 'send-status')).toContainText('tried 2 times', { timeout: 15000 });
    await expect(tid(window, 'send-status')).toHaveClass(/ok/);
    expect(server.received).toHaveLength(2);
  });

  test('a bulk run tries a message again too, and the row says so', async () => {
    await begin((n) => (n === 1 ? 'close' : 'accept'), { retries: 1 });
    await configureBulkGeneration(window, { count: 2 });
    await generateBulk(window);
    await waitForBulkDone(window);
    await goTo(window, 'send');
    await setSendMode(window, 'bulk');
    await setSendRate(window, '0');
    await clickSendBulkGo(window);
    await expect.poll(() => isConfirmDialogOpen(window)).toBe(true);
    await clickConfirmYes(window);
    await expect(tid(window, 'send-row-2')).toBeVisible({ timeout: 20000 });
    await expect(tid(window, 'send-row-1-details')).toContainText('tried 2 times');
    await expect(tid(window, 'send-row-1-result')).toContainText('Accepted');
    expect(server.received).toHaveLength(3);
  });
});
