const { test, expect } = require('@playwright/test');
const {
  HL7_MESSAGES, waitForWindow, pasteMessage, goTo, clearDirtyState,
  closeApp, takeScreenshotOnFailure, launchApp,
  setSendHost, setSendPort, setSendConnectTimeout, setSendReplyTimeout,
  setSendEncoding, clickSendTest, clickSendGo, setSendTestMessage,
  getSendStatus, getSendTestStatus, getSendSummary,
  isSendResultVisible, getSendAckText, getSendRawVisible, getSendRawHex, getSendWarningCount, getSendWarningText,
  isSendGoDisabled, isSendTestDisabled, isSendCancelVisible,
  setProfileName, clickProfileSave, clickProfileDelete,
  getProfileStatus, getSelectedProfile, selectProfile,
  getSendStatusClass, getSendTestStatusClass,
  setSendMode, getSendMode, isSendModeActive, isSendPanelVisible,
  isSendPreviewVisible, getSendPreviewText, isSendPreviewReadOnly,
  getSendValidationText, getSendValidationClass, isSendValidationIssuesVisible,
  getSendValidationIssueCount, getSendValidationIssueText,
  tid,
} = require('./helpers');
const { startMockServer } = require('../support/mock-mllp-server');

test.describe('Send — UI structure', () => {
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

  test('shows the Server card with its fields and defaults', async () => {
    await expect.soft(tid(window, 'send-title')).toHaveText('Send');
    await expect.soft(tid(window, 'send-card-server-title')).toHaveText('Server');
    await expect.soft(tid(window, 'send-server-hint')).toContainText('MLLP');
    await expect.soft(tid(window, 'send-host')).toBeVisible();
    await expect.soft(tid(window, 'send-port')).toHaveValue('2575');
    await expect.soft(tid(window, 'send-connect-timeout')).toHaveValue('10');
    await expect.soft(tid(window, 'send-reply-timeout')).toHaveValue('30');
    await expect.soft(tid(window, 'send-encoding')).toHaveValue('utf-8');
    await expect.soft(tid(window, 'send-profile')).toHaveValue('');
    await expect.soft(tid(window, 'send-profile-name')).toBeVisible();
    await expect.soft(tid(window, 'send-profile-save')).toBeVisible();
    await expect.soft(tid(window, 'send-profile-delete')).toBeDisabled();
    await expect.soft(tid(window, 'send-test')).toBeVisible();
    await expect.soft(tid(window, 'send-test-message')).not.toBeChecked();
  });

  test('shows the Message controls, with the result parts not shown yet', async () => {
    await expect.soft(tid(window, 'send-message-hint')).toContainText('Editor');
    await expect.soft(tid(window, 'send-go')).toBeVisible();
    await expect.soft(tid(window, 'send-cancel')).toBeHidden();
    // the status and result parts are in the page but hidden until something is sent
    for (const id of ['send-status', 'send-test-status', 'send-result', 'send-ack-details', 'send-raw-details', 'send-copy-ack']) {
      await expect.soft(tid(window, id)).toBeAttached();
      await expect.soft(tid(window, id)).toBeHidden();
    }
  });

  test('Send button is disabled with empty editor', async () => {
    expect(await isSendGoDisabled(window)).toBe(true);
  });

  test('Send button is enabled after pasting a message', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
    expect(await isSendGoDisabled(window)).toBe(false);
  });

  test('shows empty editor summary', async () => {
    const summary = await getSendSummary(window);
    expect(summary).toContain('empty');
  });

  test('shows message summary after pasting', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
    const summary = await getSendSummary(window);
    expect(summary).toContain('ADT');
  });

});

test.describe('Send — Test connection', () => {
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
    await goTo(window, 'send');
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
    await mockServer.close();
  });

  test('connects to mock server successfully', async () => {
    await clickSendTest(window);
    await window.waitForTimeout(3000);

    const status = await getSendTestStatus(window);
    expect(status).toContain('accepts connections');
  });

  test('shows ok status class on success', async () => {
    await clickSendTest(window);
    await window.waitForTimeout(3000);

    const cls = await getSendTestStatusClass(window);
    expect(cls).toContain('ok');
  });

  test('Test button is enabled again once the test is done', async () => {
    await clickSendTest(window);
    await expect(tid(window, 'send-test-status')).toContainText('accepts connections');
    expect(await isSendTestDisabled(window)).toBe(false);
  });

  test('fails when host is unreachable', async () => {
    await setSendHost(window, '192.0.2.1');
    await setSendConnectTimeout(window, '2');
    await clickSendTest(window);
    await window.waitForTimeout(5000);

    const status = await getSendTestStatus(window);
    expect(status).toBeTruthy();
    expect(status).not.toContain('accepts connections');
  });

  test('shows error class on connection failure', async () => {
    await setSendHost(window, '192.0.2.1');
    await setSendConnectTimeout(window, '2');
    await clickSendTest(window);
    await window.waitForTimeout(5000);

    const cls = await getSendTestStatusClass(window);
    expect(cls).toContain('error');
  });

  test('fails with empty host', async () => {
    await setSendHost(window, '');
    await clickSendTest(window);
    await window.waitForTimeout(2000);

    const status = await getSendTestStatus(window);
    expect(status).toBeTruthy();
  });

  test('does not send message when checkbox is unchecked', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
    await setSendTestMessage(window, false);
    await clickSendTest(window);
    await window.waitForTimeout(3000);

    // The send status should be empty because we only tested the connection
    const sendStatus = await getSendStatus(window);
    expect(sendStatus).toBe('');
  });

  test('sends message when checkbox is checked', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
    await setSendTestMessage(window, true);
    await clickSendTest(window);
    await window.waitForTimeout(5000);

    const sendStatus = await getSendStatus(window);
    expect(sendStatus).toBeTruthy();
    expect(sendStatus).not.toBe('');
  });

  test('shows error when checkbox checked but editor is empty', async () => {
    await setSendTestMessage(window, true);
    await clickSendTest(window);
    await window.waitForTimeout(3000);

    const status = await getSendTestStatus(window);
    expect(status).toContain('empty');
  });
});

test.describe('Send — Send message', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;
  /** @type {{ host: string, port: number, received: Array, close: () => Promise<void> }} */
  let mockServer;

  test.beforeEach(async () => {
    mockServer = await startMockServer({ mode: 'accept' });
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    await goTo(window, 'send');
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
    await mockServer.close();
  });

  test('sends message and receives ACK', async () => {
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const status = await getSendStatus(window);
    expect(status).toContain('ACK');
  });

  test('shows ok status class on success', async () => {
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const cls = await getSendStatusClass(window);
    expect(cls).toContain('ok');
  });

  test('shows ACK text in result details', async () => {
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const ackText = await getSendAckText(window);
    expect(ackText).toContain('MSH');
    expect(ackText).toContain('ACK');
  });

  test('shows ACK details section', async () => {
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    // Check the hidden attribute directly; isHidden() inherits from parent
    const hidden = await tid(window, 'send-ack-details').getAttribute('hidden');
    expect(hidden).toBe(null);
  });

  test('shows raw reply details section', async () => {
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const hidden = await tid(window, 'send-raw-details').getAttribute('hidden');
    expect(hidden).toBe(null);
  });

  test('shows raw reply visible text with framing markers', async () => {
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const raw = await getSendRawVisible(window);
    expect(raw).toContain('<VT>');
  });

  test('shows raw reply hex dump', async () => {
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const hex = await getSendRawHex(window);
    expect(hex).toContain('0b'); // VT byte
  });

  test('shows result section', async () => {
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    expect(await isSendResultVisible(window)).toBe(true);
  });

  test('server receives the message', async () => {
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    expect(mockServer.received.length).toBeGreaterThan(0);
    expect(mockServer.received[0].text).toContain('MSH');
  });

  test('sends with Windows-1252 encoding', async () => {
    await setSendEncoding(window, 'windows-1252');
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const status = await getSendStatus(window);
    expect(status).toContain('ACK');
  });
});

test.describe('Send — ACK response modes', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;
  /** @type {{ host: string, port: number, close: () => Promise<void> }} */
  let mockServer;

  test.beforeEach(async () => {
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    await goTo(window, 'send');
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
    await mockServer.close();
  });

  test('handles ACK AA (accepted)', async () => {
    mockServer = await startMockServer({ mode: 'accept' });
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const status = await getSendStatus(window);
    expect(status).toContain('accepted');
  });

  test('handles ACK AE (application error)', async () => {
    mockServer = await startMockServer({ mode: 'error' });
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const status = await getSendStatus(window);
    expect(status).toContain('AE');
  });

  test('shows error class on ACK AE', async () => {
    mockServer = await startMockServer({ mode: 'error' });
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const cls = await getSendStatusClass(window);
    expect(cls).toContain('error');
  });

  test('handles ACK AR (rejected)', async () => {
    mockServer = await startMockServer({ mode: 'reject' });
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const status = await getSendStatus(window);
    expect(status).toContain('AR');
  });

  test('handles ACK CA (enhanced accepted)', async () => {
    mockServer = await startMockServer({ mode: 'enhanced' });
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const status = await getSendStatus(window);
    expect(status).toContain('accepted');
  });

  test('handles unframed reply', async () => {
    mockServer = await startMockServer({ mode: 'unframed' });
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
    await setSendReplyTimeout(window, '5');
    await clickSendGo(window);
    await window.waitForTimeout(8000);

    const status = await getSendStatus(window);
    expect(status).toBeTruthy();
  });

  test('handles garbage reply (no MSA segment)', async () => {
    mockServer = await startMockServer({ mode: 'garbage' });
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const status = await getSendStatus(window);
    expect(status).toBeTruthy();
  });

  test('shows a control ID mismatch warning', async () => {
    mockServer = await startMockServer({ mode: 'mismatch' });
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    expect(await getSendWarningCount(window)).toBeGreaterThan(0);
    expect(await getSendWarningText(window, 1)).toContain('control ID');
  });

});

test.describe('Send — Connection profiles', () => {
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
    await goTo(window, 'send');
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
    await mockServer.close();
  });

  test('saves a connection profile', async () => {
    await setProfileName(window, 'Test Server');
    await clickProfileSave(window);

    const status = await getProfileStatus(window);
    expect(status).toContain('Saved');
  });

  test('shows profile in dropdown after save', async () => {
    await setProfileName(window, 'Test Server');
    await clickProfileSave(window);

    expect(await getSelectedProfile(window)).toBe('Test Server');
  });

  test('delete button is enabled after save', async () => {
    await setProfileName(window, 'Test Server');
    await clickProfileSave(window);

    expect(await tid(window, 'send-profile-delete').isDisabled()).toBe(false);
  });

  test('loads profile when selected from dropdown', async () => {
    await setProfileName(window, 'Test Server');
    await clickProfileSave(window);

    // Change the host, then select the profile to restore it
    await setSendHost(window, 'other-host');
    await selectProfile(window, 'Test Server');

    expect(await tid(window, 'send-host').inputValue()).toBe(mockServer.host);
  });

  test('shows loaded status when profile selected', async () => {
    await setProfileName(window, 'Test Server');
    await clickProfileSave(window);

    await setSendHost(window, 'other-host');
    await selectProfile(window, 'Test Server');

    const status = await getProfileStatus(window);
    expect(status).toContain('Loaded');
  });

  test('deletes a saved profile', async () => {
    await setProfileName(window, 'Test Server');
    await clickProfileSave(window);
    await clickProfileDelete(window);

    const status = await getProfileStatus(window);
    expect(status).toContain('Deleted');
  });

  test('shows error when saving without name', async () => {
    await setProfileName(window, '');
    await clickProfileSave(window);

    const status = await getProfileStatus(window);
    expect(status).toContain('name');
  });

  test('shows error when saving without host', async () => {
    await setSendHost(window, '');
    await setProfileName(window, 'Test');
    await clickProfileSave(window);

    const status = await getProfileStatus(window);
    expect(status).toContain('host');
  });

  test('updates existing profile', async () => {
    // Save first time
    await setProfileName(window, 'Test Server');
    await clickProfileSave(window);

    // Change port and save again with same name
    await setSendPort(window, '9999');
    await clickProfileSave(window);

    const status = await getProfileStatus(window);
    expect(status).toContain('Updated');
  });
});

test.describe('Send — Error handling', () => {
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

  test('Send button enabled with non-MSH text', async () => {
    await pasteMessage(window, HL7_MESSAGES.INVALID);
    await goTo(window, 'send');
    // The app allows sending any non-empty text; the server will reject it
    expect(await isSendGoDisabled(window)).toBe(false);
  });

  test('connection timeout on unreachable host', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
    await setSendHost(window, '192.0.2.1');
    await setSendConnectTimeout(window, '2');
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const status = await getSendStatus(window);
    expect(status).toBeTruthy();
    expect(status).not.toContain('ACK');
  });

  test('shows error class on send failure', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
    await setSendHost(window, '192.0.2.1');
    await setSendConnectTimeout(window, '2');
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const cls = await getSendStatusClass(window);
    expect(cls).toContain('error');
  });

  test('buttons re-enabled after failure', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
    await setSendHost(window, '192.0.2.1');
    await setSendConnectTimeout(window, '2');
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    expect(await isSendGoDisabled(window)).toBe(false);
    expect(await isSendTestDisabled(window)).toBe(false);
  });

  test('Cancel button hidden after operation completes', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
    await setSendHost(window, '192.0.2.1');
    await setSendConnectTimeout(window, '2');
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    expect(await isSendCancelVisible(window)).toBe(false);
  });
});

test.describe('Send — Silent server (no reply)', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;
  /** @type {{ host: string, port: number, close: () => Promise<void> }} */
  let mockServer;

  test.beforeEach(async () => {
    mockServer = await startMockServer({ mode: 'silent' });
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    await goTo(window, 'send');
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
    await mockServer.close();
  });

  test('times out when server does not reply', async () => {
    await setSendReplyTimeout(window, '2');
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const status = await getSendStatus(window);
    expect(status).toContain('no ACK');
  });
});

test.describe('Send — Close server (closes without reply)', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;
  /** @type {{ host: string, port: number, close: () => Promise<void> }} */
  let mockServer;

  test.beforeEach(async () => {
    mockServer = await startMockServer({ mode: 'close' });
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    await goTo(window, 'send');
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
    await mockServer.close();
  });

  test('detects server closing without ACK', async () => {
    await setSendReplyTimeout(window, '5');
    await clickSendGo(window);
    await window.waitForTimeout(8000);

    const status = await getSendStatus(window);
    expect(status).toBeTruthy();
    expect(status).not.toContain('accepted');
  });
});

// ---------------------------------------------------------------- Mode switch

test.describe('Send — Mode switch', () => {
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

  test('starts on the Single message tab, and the tabs are marked up as tabs', async () => {
    await expect.soft(tid(window, 'send-modes')).toBeVisible();
    await expect.soft(tid(window, 'send-modes')).toHaveAttribute('aria-label', 'What to send');
    await expect.soft(tid(window, 'send-mode')).toHaveValue('single');
    for (const [mode, label, active] of [['single', 'Single message', 'true'], ['bulk', 'Bulk send', 'false']]) {
      const tab = tid(window, `send-mode-${mode}`);
      await expect.soft(tab).toHaveText(label);
      await expect.soft(tab).toHaveAttribute('role', 'tab');
      await expect.soft(tab).toHaveAttribute('aria-selected', active);
      const panel = tid(window, `send-panel-${mode}`);
      await expect.soft(panel).toHaveAttribute('role', 'tabpanel');
      await expect.soft(panel).toHaveAttribute('aria-labelledby', `send-mode-${mode}`);
    }
    await expect.soft(tid(window, 'send-panel-single')).toBeVisible();
    await expect.soft(tid(window, 'send-panel-bulk')).toBeHidden();
  });

  test('clicking Bulk send tab switches mode', async () => {
    await setSendMode(window, 'bulk');
    expect(await isSendModeActive(window, 'bulk')).toBe(true);
    expect(await isSendModeActive(window, 'single')).toBe(false);
    expect(await getSendMode(window)).toBe('bulk');
  });

  test('clicking Single message tab switches back', async () => {
    await setSendMode(window, 'bulk');
    await setSendMode(window, 'single');
    expect(await isSendModeActive(window, 'single')).toBe(true);
    expect(await getSendMode(window)).toBe('single');
  });

  test('Bulk panel is visible when Bulk mode is active', async () => {
    await setSendMode(window, 'bulk');
    expect(await isSendPanelVisible(window, 'bulk')).toBe(true);
    expect(await isSendPanelVisible(window, 'single')).toBe(false);
  });

});

// ---------------------------------------------------------------- Single send preview

test.describe('Send — Single message preview', () => {
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

  test('preview is hidden when editor is empty', async () => {
    expect(await isSendPreviewVisible(window)).toBe(false);
  });

  test('preview appears when editor has a message', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
    await window.waitForTimeout(1000);
    expect(await isSendPreviewVisible(window)).toBe(true);
  });

  test('preview shows the editor message content', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
    await window.waitForTimeout(1000);
    const preview = await getSendPreviewText(window);
    expect(preview).toContain('MSH');
    expect(preview).toContain('ADT');
  });

  test('preview textarea is read-only', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
    await window.waitForTimeout(1000);
    expect(await isSendPreviewReadOnly(window)).not.toBe(null);
  });

  test('validation summary shows no problems for valid message', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
    await window.waitForTimeout(1500);
    const text = await getSendValidationText(window);
    expect(text).toContain('no problems');
  });

  test('validation summary has ok class for valid message', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
    await window.waitForTimeout(1500);
    const cls = await getSendValidationClass(window);
    expect(cls).toContain('ok');
  });

  test('validation issues list is hidden for valid message', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
    await window.waitForTimeout(1500);
    expect(await isSendValidationIssuesVisible(window)).toBe(false);
  });

  test('validation summary shows errors for invalid message', async () => {
    await pasteMessage(window, HL7_MESSAGES.INVALID);
    await goTo(window, 'send');
    await window.waitForTimeout(1500);
    const text = await getSendValidationText(window);
    expect(text).toContain('Validation');
  });

  test('validation summary has error class when errors exist', async () => {
    await pasteMessage(window, HL7_MESSAGES.INVALID);
    await goTo(window, 'send');
    await window.waitForTimeout(1500);
    const cls = await getSendValidationClass(window);
    expect(cls).toContain('error');
  });

  test('validation issues list is visible when there are issues', async () => {
    await pasteMessage(window, HL7_MESSAGES.INVALID);
    await goTo(window, 'send');
    await window.waitForTimeout(1500);
    expect(await isSendValidationIssuesVisible(window)).toBe(true);
  });

  test('validation issues show error labels', async () => {
    await pasteMessage(window, HL7_MESSAGES.INVALID);
    await goTo(window, 'send');
    await window.waitForTimeout(1500);
    const count = await getSendValidationIssueCount(window);
    expect(count).toBeGreaterThan(0);
    const first = await getSendValidationIssueText(window, 1);
    expect(first).toContain('Error');
  });

  test('validation summary says message can still be sent', async () => {
    await pasteMessage(window, HL7_MESSAGES.INVALID);
    await goTo(window, 'send');
    await window.waitForTimeout(1500);
    const text = await getSendValidationText(window);
    expect(text).toContain('can still be sent');
  });

  test('validation summary shows warning count', async () => {
    // A message with warnings but no errors
    const msgWithWarnings = 'MSH|^~\\&|SENDER|FACILITY|RECEIVER|FACILITY|20261023120000||ADT^A01|MSG0001|T|2.5.1\rPID|1';
    await pasteMessage(window, msgWithWarnings);
    await goTo(window, 'send');
    await window.waitForTimeout(1500);
    const text = await getSendValidationText(window);
    expect(text).toContain('Validation');
  });

  test('preview updates when editor content changes', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
    await window.waitForTimeout(1000);
    let preview = await getSendPreviewText(window);
    expect(preview).toContain('ADT');

    // Change the message
    await goTo(window, 'editor');
    await tid(window, 'message').fill(HL7_MESSAGES.ORU_R01);
    await goTo(window, 'send');
    await window.waitForTimeout(1000);
    preview = await getSendPreviewText(window);
    expect(preview).toContain('ORU');
  });

  test('validation summary is empty when editor is empty', async () => {
    const text = await getSendValidationText(window);
    expect(text).toBe('');
  });
});
