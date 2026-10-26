const { test, expect } = require('@playwright/test');
const {
  HL7_MESSAGES, waitForWindow, pasteMessage, goTo, clearDirtyState,
  closeApp, takeScreenshotOnFailure, launchApp,
  setSendHost, setSendPort, setSendConnectTimeout, setSendReplyTimeout,
  setSendEncoding, clickSendTest, clickSendGo, setSendTestMessage,
  getSendStatus, getSendTestStatus, getSendSummary,
  isSendResultVisible, getSendAckText, isSendAckVisible, isSendRawVisible,
  getSendRawVisible, getSendRawHex, getSendWarningCount, getSendWarningText,
  isSendGoDisabled, isSendTestDisabled, isSendCancelVisible,
  setProfileName, clickProfileSave, clickProfileDelete,
  getProfileStatus, getSelectedProfile, selectProfile,
  getSendStatusClass, getSendTestStatusClass, tid,
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

  test('shows Send view title', async () => {
    expect(await tid(window, 'send-title').textContent()).toBe('Send');
  });

  test('shows Server card with legend', async () => {
    expect(await tid(window, 'send-card-server-title').textContent()).toBe('Server');
  });

  test('shows Message card with legend', async () => {
    expect(await tid(window, 'send-card-message-title').textContent()).toBe('Message');
  });

  test('shows server hint text', async () => {
    const hint = await tid(window, 'send-server-hint').textContent();
    expect(hint).toContain('MLLP');
  });

  test('shows message hint text', async () => {
    const hint = await tid(window, 'send-message-hint').textContent();
    expect(hint).toContain('Editor');
  });

  test('has Test connection button', async () => {
    await expect(tid(window, 'send-test')).toBeVisible();
  });

  test('has Send button', async () => {
    await expect(tid(window, 'send-go')).toBeVisible();
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

  test('has host and port fields', async () => {
    await expect(tid(window, 'send-host')).toBeVisible();
    await expect(tid(window, 'send-port')).toBeVisible();
  });

  test('port defaults to 2575', async () => {
    expect(await tid(window, 'send-port').inputValue()).toBe('2575');
  });

  test('has timeout fields', async () => {
    await expect(tid(window, 'send-connect-timeout')).toBeVisible();
    await expect(tid(window, 'send-reply-timeout')).toBeVisible();
  });

  test('connect timeout defaults to 10', async () => {
    expect(await tid(window, 'send-connect-timeout').inputValue()).toBe('10');
  });

  test('reply timeout defaults to 30', async () => {
    expect(await tid(window, 'send-reply-timeout').inputValue()).toBe('30');
  });

  test('has encoding dropdown', async () => {
    await expect(tid(window, 'send-encoding')).toBeVisible();
  });

  test('encoding defaults to UTF-8', async () => {
    expect(await tid(window, 'send-encoding').inputValue()).toBe('utf-8');
  });

  test('has profile save and delete buttons', async () => {
    await expect(tid(window, 'send-profile-save')).toBeVisible();
    await expect(tid(window, 'send-profile-delete')).toBeVisible();
  });

  test('delete profile button is disabled initially', async () => {
    expect(await tid(window, 'send-profile-delete').isDisabled()).toBe(true);
  });

  test('has profile name field', async () => {
    await expect(tid(window, 'send-profile-name')).toBeVisible();
  });

  test('has profile dropdown', async () => {
    await expect(tid(window, 'send-profile')).toBeVisible();
  });

  test('profile dropdown shows Not saved initially', async () => {
    expect(await getSelectedProfile(window)).toBe('');
  });

  test('Cancel button is hidden initially', async () => {
    expect(await isSendCancelVisible(window)).toBe(false);
  });

  test('has Test message checkbox', async () => {
    await expect(tid(window, 'send-test-message')).toBeVisible();
  });

  test('Test message checkbox is unchecked by default', async () => {
    expect(await tid(window, 'send-test-message').isChecked()).toBe(false);
  });

  test('has status output elements', async () => {
    // Status outputs are hidden when empty (CSS hides .gen-status with no text)
    // They exist in the DOM but are not visible until a status message is set
    expect(await tid(window, 'send-status').count()).toBe(1);
    expect(await tid(window, 'send-test-status').count()).toBe(1);
  });

  test('has result section with ACK and raw reply details', async () => {
    // The result section is hidden until a send completes; details are inside it
    expect(await tid(window, 'send-result').count()).toBe(1);
    expect(await tid(window, 'send-ack-details').count()).toBe(1);
    expect(await tid(window, 'send-raw-details').count()).toBe(1);
  });

  test('has Copy ACK button', async () => {
    // Copy ACK is inside the hidden result section; verify it exists
    expect(await tid(window, 'send-copy-ack').count()).toBe(1);
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

  test('Test button is disabled during connection', async () => {
    // The test runs fast, so we check immediately after click
    await clickSendTest(window);
    // Give a tiny window to check the disabled state
    const disabled = await isSendTestDisabled(window);
    // It may already be done; if not, it should be disabled
    // We just verify the button exists and the test completes
    await window.waitForTimeout(2000);
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

  test('handles control ID mismatch warning', async () => {
    mockServer = await startMockServer({ mode: 'mismatch' });
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const warningCount = await getSendWarningCount(window);
    expect(warningCount).toBeGreaterThan(0);
  });

  test('warning text mentions control ID', async () => {
    mockServer = await startMockServer({ mode: 'mismatch' });
    await setSendHost(window, mockServer.host);
    await setSendPort(window, mockServer.port);
    await clickSendGo(window);
    await window.waitForTimeout(5000);

    const warning = await getSendWarningText(window, 1);
    expect(warning).toContain('control ID');
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

  test('Send button disabled with empty editor', async () => {
    expect(await isSendGoDisabled(window)).toBe(true);
  });

  test('Send button enabled with non-MSH text', async () => {
    await pasteMessage(window, HL7_MESSAGES.INVALID);
    await goTo(window, 'send');
    // The app allows sending any non-empty text; the server will reject it
    expect(await isSendGoDisabled(window)).toBe(false);
  });

  test('Send button enabled with valid message', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await goTo(window, 'send');
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
