// Send tab: the things the first e2e round did not cover (see doc/E2E_AUDIT.md, section 4).
// Each describe starts its own app on its own data folder and, where needed, its own mock MLLP server.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const {
  HL7_MESSAGES, waitForWindow, pasteMessage, goTo, clearDirtyState,
  closeApp, takeScreenshotOnFailure, launchApp, makeTempDir, removeTempDir,
  stubDialogs, queueDialog, waitForFileText,
  configureBulkGeneration, generateBulk, waitForBulkDone,
  setSendHost, setSendPort, setSendConnectTimeout, setSendReplyTimeout, setSendEncoding,
  setSendRate, setSendDelayCustom, setSendStopOnError, setSendMode,
  clickSendGo, clickSendBulkGo, clickSendBulkCancel, clickSendBulkExport,
  clickConfirmYes, clickConfirmNo, isConfirmDialogOpen, getConfirmDialogText,
  setProfileName, clickProfileSave, getProfileStatus,
  isSendModeActive, isSendBulkCancelVisible, isSendGoDisabled, isSendCancelVisible,
  tid,
} = require('./helpers');
const { startMockServer } = require('../support/mock-mllp-server');

/** Start the app, optionally on the data folder of an earlier run. */
async function startApp(userDataDir) {
  const electronApp = await launchApp({ userDataDir });
  const window = await waitForWindow(electronApp);
  await clearDirtyState(window);
  return { electronApp, window };
}

/** Generate `count` bulk messages and go to the Send tab in Bulk mode, pointing at the mock server. */
async function prepareBulk(window, server, { count = 3, rate = '0' } = {}) {
  await configureBulkGeneration(window, { count });
  await generateBulk(window);
  await waitForBulkDone(window);
  await goTo(window, 'send');
  await setSendMode(window, 'bulk');
  await setSendHost(window, server.host);
  await setSendPort(window, server.port);
  await setSendRate(window, rate);
}

/** Press "Send all..." and answer the confirmation with Send. */
async function startBulkRun(window) {
  await clickSendBulkGo(window);
  await expect.poll(() => isConfirmDialogOpen(window)).toBe(true);
  await clickConfirmYes(window);
}

// ---------------------------------------------------------------- Remembered between runs

test.describe('Send — remembered between runs', () => {
  let dataDir;
  let electronApp;
  let window;

  test.beforeEach(() => {
    dataDir = makeTempDir();
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await takeScreenshotOnFailure(window, testInfo);
    await closeApp(electronApp);
    removeTempDir(dataDir);
  });

  const restart = async () => {
    await closeApp(electronApp, { keepData: true });
    ({ electronApp, window } = await startApp(dataDir));
    await goTo(window, 'send');
  };

  test('server fields, pace, stop-on-error and mode are restored', async () => {
    ({ electronApp, window } = await startApp(dataDir));
    await goTo(window, 'send');
    await setSendHost(window, 'hl7.example.test');
    await setSendPort(window, 6001);
    await setSendConnectTimeout(window, 7);
    await setSendReplyTimeout(window, 12);
    await setSendEncoding(window, 'windows-1252');
    await setSendMode(window, 'bulk');
    await setSendRate(window, 'custom');
    await setSendDelayCustom(window, 45);
    await setSendStopOnError(window, true);
    // settings are written a moment after the change: wait for the file instead of a fixed time
    await expect.poll(() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).controls['send-mode'];
      } catch {
        return null;
      }
    }).toBe('bulk');

    await restart();

    await expect(tid(window, 'send-host')).toHaveValue('hl7.example.test');
    await expect(tid(window, 'send-port')).toHaveValue('6001');
    await expect(tid(window, 'send-connect-timeout')).toHaveValue('7');
    await expect(tid(window, 'send-reply-timeout')).toHaveValue('12');
    await expect(tid(window, 'send-encoding')).toHaveValue('windows-1252');
    await expect(tid(window, 'send-rate')).toHaveValue('custom');
    await expect(tid(window, 'send-delay-custom')).toHaveValue('45');
    await expect(tid(window, 'send-stop-on-error')).toBeChecked();
    expect(await isSendModeActive(window, 'bulk')).toBe(true);
    await expect(tid(window, 'send-panel-bulk')).toBeVisible();
    await expect(tid(window, 'send-panel-single')).toBeHidden();
  });

  test('a saved connection is still there and can be loaded', async () => {
    ({ electronApp, window } = await startApp(dataDir));
    await goTo(window, 'send');
    await setSendHost(window, 'lab.example.test');
    await setSendPort(window, 7002);
    await setProfileName(window, 'Lab');
    await clickProfileSave(window);
    await expect(tid(window, 'send-profile-status')).toContainText('Saved "Lab"');

    await restart();

    await expect(tid(window, 'send-profile').locator('option')).toHaveCount(2);
    await setSendHost(window, 'other.example.test');
    await tid(window, 'send-profile').selectOption('Lab');
    await expect(tid(window, 'send-host')).toHaveValue('lab.example.test');
    await expect(tid(window, 'send-port')).toHaveValue('7002');
  });
});

// ---------------------------------------------------------------- Keyboard and window

test.describe('Send — keyboard and window', () => {
  let electronApp;
  let window;

  test.beforeEach(async () => {
    ({ electronApp, window } = await startApp());
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await takeScreenshotOnFailure(window, testInfo);
    await closeApp(electronApp);
  });

  test('arrow keys move between the Single and Bulk tabs', async () => {
    await goTo(window, 'send');
    await tid(window, 'send-mode-single').focus();
    await window.keyboard.press('ArrowRight');
    expect(await isSendModeActive(window, 'bulk')).toBe(true);
    await expect(tid(window, 'send-mode-bulk')).toBeFocused();
    await window.keyboard.press('ArrowLeft');
    expect(await isSendModeActive(window, 'single')).toBe(true);
    await expect(tid(window, 'send-mode-single')).toBeFocused();
  });

  test('Ctrl/Cmd+D duplicates a line and one Undo takes the copy away', async () => {
    await goTo(window, 'editor');
    const original = 'MSH|a\nPID|b';
    await tid(window, 'message').fill(original);
    await window.evaluate(() => document.getElementById('message').setSelectionRange(0, 0));
    await tid(window, 'message').press('ControlOrMeta+d');
    await expect(tid(window, 'message')).toHaveValue('MSH|a\nMSH|a\nPID|b');
    await tid(window, 'message').press('ControlOrMeta+z');
    await expect(tid(window, 'message')).toHaveValue(original);
  });

  test('closing the last window quits the app', async () => {
    const child = electronApp.process();
    await electronApp.evaluate(({ BrowserWindow }) => {
      for (const win of BrowserWindow.getAllWindows()) win.close();
    }).catch(() => {}); // the app may quit before it answers
    await expect.poll(() => child.exitCode !== null || child.signalCode !== null, { timeout: 10000 }).toBe(true);
  });
});

// ---------------------------------------------------------------- Single send

test.describe('Send — single message details', () => {
  let electronApp;
  let window;
  let server;

  test.beforeEach(async () => {
    ({ electronApp, window } = await startApp());
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await takeScreenshotOnFailure(window, testInfo);
    await closeApp(electronApp);
    await server?.close();
    server = undefined;
  });

  const useServer = async (options) => {
    server = await startMockServer(options);
    await setSendHost(window, server.host);
    await setSendPort(window, server.port);
  };

  test('the ACK and Raw reply sections open and close', async () => {
    await useServer({ mode: 'accept' });
    await clickSendGo(window);
    await expect(tid(window, 'send-ack-details')).toBeVisible();
    for (const name of ['ack', 'raw']) {
      const details = tid(window, `send-${name}-details`);
      await expect(details).not.toHaveAttribute('open', /.*/);
      await tid(window, `send-${name}-summary`).click();
      await expect(details).toHaveAttribute('open', /.*/);
      await tid(window, `send-${name}-summary`).click();
      await expect(details).not.toHaveAttribute('open', /.*/);
    }
  });

  test('Copy ACK puts the ACK on the clipboard', async () => {
    await useServer({ mode: 'accept' });
    await clickSendGo(window);
    await tid(window, 'send-ack-summary').click();
    await tid(window, 'send-copy-ack').click();
    await expect.poll(() => electronApp.evaluate(({ clipboard }) => clipboard.readText())).toContain('MSA|AA|');
  });

  test('Cancel stops a send that is waiting for the ACK', async () => {
    await useServer({ mode: 'silent' });
    await clickSendGo(window);
    await expect(tid(window, 'send-cancel')).toBeVisible();
    await tid(window, 'send-cancel').click();
    await expect(tid(window, 'send-status')).toContainText('cancelled');
    await expect(tid(window, 'send-status')).toHaveClass(/error/);
    expect(await isSendCancelVisible(window)).toBe(false);
    expect(await isSendGoDisabled(window)).toBe(false);
  });

  for (const [mode, code] of [['enhancedError', 'CE'], ['enhancedReject', 'CR']]) {
    test(`ACK ${code} is shown as a failure`, async () => {
      await useServer({ mode });
      await clickSendGo(window);
      await expect(tid(window, 'send-status')).toContainText(code);
      await expect(tid(window, 'send-status')).toHaveClass(/error/);
    });
  }
});

// ---------------------------------------------------------------- Saved connections

test.describe('Send — saved connections, edge cases', () => {
  let electronApp;
  let window;

  test.beforeEach(async () => {
    ({ electronApp, window } = await startApp());
    await goTo(window, 'send');
    await setSendHost(window, 'one.example.test');
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await takeScreenshotOnFailure(window, testInfo);
    await closeApp(electronApp);
  });

  test('names that differ only in case are the same connection', async () => {
    await setProfileName(window, 'Test');
    await clickProfileSave(window);
    await setSendPort(window, 3000);
    await setProfileName(window, 'test');
    await clickProfileSave(window);
    expect(await getProfileStatus(window)).toContain('Updated "test"');
    await expect(tid(window, 'send-profile').locator('option')).toHaveCount(2); // "Not saved" and one connection
  });

  test('the list goes back to "Not saved" when a field is changed', async () => {
    await setProfileName(window, 'Mine');
    await clickProfileSave(window);
    await expect(tid(window, 'send-profile').locator('option:checked')).toHaveText('Mine');
    await setSendPort(window, 4999);
    await expect(tid(window, 'send-profile').locator('option:checked')).toHaveText('Not saved');
    await expect(tid(window, 'send-profile-delete')).toBeDisabled();
  });

  test('no more than 100 connections can be saved', async () => {
    // fill the list directly: 100 clicks on Save would only repeat the same test
    await window.evaluate(async () => {
      const list = Array.from({ length: 100 }, (_, i) => ({
        name: `Server ${i + 1}`, host: `host${i + 1}.example.test`, port: 2575, connectTimeout: 10, replyTimeout: 30, encoding: 'utf-8',
      }));
      // `profiles` and renderProfiles() belong to renderer.js
      profiles = await window.hl7.setProfiles(list);
      renderProfiles();
    });
    await setProfileName(window, 'One too many');
    await clickProfileSave(window);
    expect(await getProfileStatus(window)).toContain('up to 100');
    await expect(tid(window, 'send-profile').locator('option')).toHaveCount(101);
  });
});

// ---------------------------------------------------------------- Bulk send

test.describe('Send — bulk, edge cases', () => {
  let electronApp;
  let window;
  let server;

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await takeScreenshotOnFailure(window, testInfo);
    await closeApp(electronApp);
    await server?.close();
    server = undefined;
  });

  const begin = async (serverOptions, bulkOptions) => {
    server = await startMockServer(serverOptions);
    ({ electronApp, window } = await startApp());
    await prepareBulk(window, server, bulkOptions);
  };

  test('reconnects when the server closed the connection, and says so in the row', async () => {
    // a pause of one second between the messages: without it the next message can leave before the app
    // has noticed that the server hung up, and then that message fails instead of reconnecting
    await begin({ mode: (n) => (n === 1 ? 'closeAfterReply' : 'accept') }, { rate: '1' });
    await startBulkRun(window);
    await expect(tid(window, 'send-row-3')).toBeVisible({ timeout: 20000 });
    await expect(tid(window, 'send-row-2-details')).toContainText('Connected again');
    await expect(tid(window, 'send-row-3-details')).not.toContainText('Connected again');
    expect(server.received).toHaveLength(3);
    expect(server.connections).toBe(2);
  });

  test('shows a countdown between messages and a result after Cancel', async () => {
    await begin({ mode: 'accept' }, { count: 3, rate: '10' });
    await startBulkRun(window);
    await expect(tid(window, 'send-bulk-status')).toContainText(/Next message in \d+:\d\d/, { timeout: 15000 });
    expect(await isSendBulkCancelVisible(window)).toBe(true);
    await clickSendBulkCancel(window);
    await expect(tid(window, 'send-bulk-status')).toContainText(/Cancelled after 1 of 3 messages/, { timeout: 15000 });
    expect(await isSendBulkCancelVisible(window)).toBe(false);
    expect(server.received).toHaveLength(1);
  });

  test('a custom pace that is empty or above 3600 seconds is refused', async () => {
    await begin({ mode: 'accept' });
    await setSendRate(window, 'custom');
    for (const value of ['', '3601']) {
      await tid(window, 'send-delay-custom').fill(value);
      await clickSendBulkGo(window);
      await expect(tid(window, 'send-bulk-status')).toContainText('Enter the seconds between messages, from 0 to 3600');
      await expect(tid(window, 'send-bulk-status')).toHaveClass(/error/);
      expect(await isConfirmDialogOpen(window)).toBe(false);
    }
    expect(server.received).toHaveLength(0);
  });

  test('an empty host is refused', async () => {
    await begin({ mode: 'accept' });
    await setSendHost(window, '');
    await clickSendBulkGo(window);
    await expect(tid(window, 'send-bulk-status')).toContainText('Enter the host first.');
    expect(await isConfirmDialogOpen(window)).toBe(false);
  });

  test('the confirmation names the messages that have validation errors', async () => {
    await begin({ mode: 'accept' });
    // The bulk messages cannot be edited yet (planned for 0.4.0), so spoil the first one in the page
    await window.evaluate(() => {
      // `bulkMessages` belongs to renderer.js
      bulkMessages[0].text = 'MSH|^~\\&|ONLY|HEADER';
    });
    await clickSendBulkGo(window);
    await expect.poll(() => isConfirmDialogOpen(window)).toBe(true);
    const text = await getConfirmDialogText(window);
    expect(text).toContain('1 of 3 messages have validation errors (the first is message 1)');
    expect(text).toContain('They are sent anyway.');
    await clickConfirmNo(window);
    expect(server.received).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- CSV report

test.describe('Send — CSV report', () => {
  let electronApp;
  let window;
  let server;
  let folder;

  test.beforeEach(async () => {
    folder = makeTempDir();
    server = await startMockServer({ mode: (n) => (n === 2 ? 'reject' : 'accept') });
    ({ electronApp, window } = await startApp());
    await stubDialogs(electronApp);
    await prepareBulk(window, server);
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await takeScreenshotOnFailure(window, testInfo);
    await closeApp(electronApp);
    await server.close();
    removeTempDir(folder);
  });

  test('the saved file has a header and one line per message', async () => {
    await startBulkRun(window);
    await expect(tid(window, 'send-bulk-export')).toBeVisible({ timeout: 15000 });
    const file = path.join(folder, 'report.csv');
    await queueDialog(electronApp, 'save', { path: file });
    await clickSendBulkExport(window);
    await expect(tid(window, 'send-bulk-export-status')).toContainText('Saved 3 rows');

    const text = (await waitForFileText(file)).replace(/^﻿/, '');
    const lines = text.trimEnd().split('\r\n');
    expect(lines[0]).toBe('Number,Type,Control ID,Outcome,ACK code,Message,Time (ms),Sent at,Connected again');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/^1,.*,accepted,AA,/);
    expect(lines[2]).toMatch(/^2,.*,rejected,AR,/);
    expect(lines[3]).toMatch(/^3,.*,accepted,AA,/);
  });

  test('cancelling the Save dialog writes nothing and says nothing', async () => {
    await startBulkRun(window);
    await expect(tid(window, 'send-bulk-export')).toBeVisible({ timeout: 15000 });
    await queueDialog(electronApp, 'save', { canceled: true });
    await clickSendBulkExport(window);
    await expect(tid(window, 'send-bulk-export-status')).toHaveText('');
    expect(fs.readdirSync(folder)).toHaveLength(0);
  });
});
