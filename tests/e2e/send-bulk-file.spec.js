// Bulk send from a file: "Load from file..." on the Bulk send tab.
// The file dialog is replaced by a stand-in that answers with a file made for the test.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const {
  HL7_MESSAGES, waitForWindow, goTo, clearDirtyState,
  closeApp, takeScreenshotOnFailure, launchApp, makeTempDir, removeTempDir,
  stubDialogs, queueDialog,
  configureBulkGeneration, generateBulk, waitForBulkDone,
  setSendMode, setSendHost, setSendPort, setSendRate,
  clickSendBulkGo, clickConfirmYes, isConfirmDialogOpen,
  tid,
} = require('./helpers');
const { startMockServer } = require('../support/mock-mllp-server');

/** A small message with its own control ID, so the server can tell which one arrived. */
const msg = (id) => `MSH|^~\\&|HIS|MAIN|EHR|MAIN|20261024120000||ADT^A01|${id}|T|2.5.1\rPID|1||${id}^^^MAIN^MR||DOE^JOHN`;

const BATCH_FILE = [
  String.raw`FHS|^~\&|HIS|MAIN|EHR|MAIN|20261024120000`, String.raw`BHS|^~\&|HIS|MAIN|EHR|MAIN|20261024120000`,
  msg('F1'), msg('F2'), 'BTS|2', 'FTS|1',
].join('\r');

test.describe('Bulk send from a file', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;
  let folder;
  let server;

  test.beforeEach(async () => {
    folder = makeTempDir();
    server = await startMockServer({ mode: 'accept' });
    electronApp = await launchApp();
    await stubDialogs(electronApp);
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    await goTo(window, 'send');
    await setSendMode(window, 'bulk');
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) await takeScreenshotOnFailure(window, testInfo);
    await closeApp(electronApp);
    await server.close();
    removeTempDir(folder);
  });

  /** Write a file and answer the next file dialog with it; then press "Load from file...". */
  const load = async (name, content) => {
    const file = path.join(folder, name);
    fs.writeFileSync(file, content);
    await queueDialog(electronApp, 'open', { paths: [file] });
    await tid(window, 'send-bulk-file').click();
  };

  const run = async () => {
    await setSendHost(window, server.host);
    await setSendPort(window, server.port);
    await setSendRate(window, '0');
    await clickSendBulkGo(window);
    await expect.poll(() => isConfirmDialogOpen(window)).toBe(true);
    await clickConfirmYes(window);
  };

  test('the Load from file controls are there, and nothing is loaded at the start', async () => {
    await expect.soft(tid(window, 'send-bulk-file')).toHaveText('Load from file...');
    await expect.soft(tid(window, 'send-bulk-file-clear')).toBeHidden();
    await expect.soft(tid(window, 'send-bulk-file-status')).toHaveText('');
    await expect.soft(tid(window, 'send-bulk-source-actions')).toBeVisible();
    await expect.soft(tid(window, 'send-bulk-hint')).toContainText('file');
  });

  test('a loaded file is reported, replaces the Bulk tab messages and can be taken away again', async () => {
    await configureBulkGeneration(window, { count: 5 });
    await generateBulk(window);
    await waitForBulkDone(window);
    await goTo(window, 'send');
    await setSendMode(window, 'bulk');
    await expect(tid(window, 'send-bulk-summary')).toContainText('5 messages from the Bulk tab');

    await load('two.hl7', [msg('A1'), msg('A2')].join('\r\n'));
    await expect(tid(window, 'send-bulk-file-status')).toContainText('Loaded 2 messages from two.hl7');
    await expect(tid(window, 'send-bulk-file-status')).toHaveClass(/ok/);
    await expect(tid(window, 'send-bulk-summary')).toContainText('2 messages from two.hl7');
    await expect(tid(window, 'send-bulk-file-clear')).toBeVisible();

    await tid(window, 'send-bulk-file-clear').click();
    await expect(tid(window, 'send-bulk-summary')).toContainText('5 messages from the Bulk tab');
    await expect(tid(window, 'send-bulk-file-clear')).toBeHidden();
    await expect(tid(window, 'send-bulk-file-status')).toHaveText('');
  });

  test('files with one message, many messages and a .txt name are read; a new file replaces the old one', async () => {
    await load('one.hl7', msg('B1'));
    await expect(tid(window, 'send-bulk-summary')).toContainText('1 message from one.hl7');
    await load('ten.txt', Array.from({ length: 10 }, (_, i) => msg(`C${i + 1}`)).join('\r\n'));
    await expect(tid(window, 'send-bulk-summary')).toContainText('10 messages from ten.txt');
    await expect(tid(window, 'send-bulk-file-status')).toContainText('Loaded 10 messages from ten.txt');
  });

  test('a file with batch headers is read, and the status mentions that they are not sent', async () => {
    await load('batch.hl7', BATCH_FILE);
    await expect(tid(window, 'send-bulk-summary')).toContainText('2 messages from batch.hl7');
    await expect(tid(window, 'send-bulk-file-status')).toContainText('batch headers');
  });

  test('a file that is empty is refused with a message and nothing is loaded', async () => {
    await load('empty.hl7', '');
    await expect(tid(window, 'send-bulk-file-status')).toContainText('empty');
    await expect(tid(window, 'send-bulk-file-status')).toHaveClass(/error/);
    await expect(tid(window, 'send-bulk-file-clear')).toBeHidden();
    await expect(tid(window, 'send-bulk-go')).toBeDisabled();
  });

  test('cancelling the file dialog changes nothing', async () => {
    await queueDialog(electronApp, 'open', { canceled: true });
    await tid(window, 'send-bulk-file').click();
    await expect(tid(window, 'send-bulk-file-status')).toHaveText('');
    await expect(tid(window, 'send-bulk-file-clear')).toBeHidden();
    await expect(tid(window, 'send-bulk-summary')).toContainText('no messages yet');
  });

  test('the messages of a batch file are sent one by one, without the batch headers', async () => {
    await load('batch.hl7', BATCH_FILE);
    await run();
    await expect.poll(() => tid(window, 'send-bulk-status').textContent(), { timeout: 30000 }).toContain('Done: 2 messages sent');
    await expect(tid(window, 'send-row-2-result')).toContainText('Accepted');
    expect(server.received.map((item) => item.text.split('\r')[0].split('|')[9])).toEqual(['F1', 'F2']);
    expect(server.received.every((item) => item.text.startsWith('MSH'))).toBe(true);
  });

  test('a file of the same message twice is sent twice', async () => {
    await load('same.hl7', [HL7_MESSAGES.ADT_A01, HL7_MESSAGES.ADT_A01].join('\r\n'));
    await run();
    await expect.poll(() => tid(window, 'send-bulk-status').textContent(), { timeout: 30000 }).toContain('Done: 2 messages sent');
    expect(server.received).toHaveLength(2);
  });
});
