const { test, expect } = require('@playwright/test');
const {
  HL7_MESSAGES, waitForWindow, pasteMessage, generateMessage, getMessageText,
  getValidationBadge, getGenStatus, clickFavorite, isFavorited,
  clearDirtyState, closeApp, tid,
  launchApp, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('Message Generation', () => {
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

  test('generates ADT^A01 message with defaults', async () => {
    await generateMessage(window);

    // Check status message
    const status = await getGenStatus(window);
    expect(status).toContain('Generated');
    expect(status).toContain('ADT');

    // Check message appears in textarea
    const message = await getMessageText(window);
    expect(message).toBeTruthy();
    expect(message).toContain('MSH');
    expect(message).toContain('ADT');
  });

  test('generates ADT^A02 message', async () => {
    await generateMessage(window, { messageType: 'ADT^A02' });

    const status = await getGenStatus(window);
    expect(status).toContain('ADT');

    const message = await getMessageText(window);
    expect(message).toContain('ADT^A02');
  });

  test('generates ADT^A03 message', async () => {
    await generateMessage(window, { messageType: 'ADT^A03' });

    const message = await getMessageText(window);
    expect(message).toContain('ADT^A03');
  });

  test('generates ADT^A08 message', async () => {
    await generateMessage(window, { messageType: 'ADT^A08' });

    const message = await getMessageText(window);
    expect(message).toContain('ADT^A08');
  });

  test('generates ADT^A18 message', async () => {
    await generateMessage(window, { messageType: 'ADT^A18' });

    const message = await getMessageText(window);
    expect(message).toContain('ADT^A18');
  });

  test('generates ADT^A40 message', async () => {
    await generateMessage(window, { messageType: 'ADT^A40' });

    const message = await getMessageText(window);
    expect(message).toContain('ADT^A40');
  });

  test('generates ADT^A60 message', async () => {
    await generateMessage(window, { messageType: 'ADT^A60' });

    const message = await getMessageText(window);
    expect(message).toContain('ADT^A60');
  });

  test('generates ORU^R01 message', async () => {
    await generateMessage(window, { messageType: 'ORU^R01' });

    const message = await getMessageText(window);
    expect(message).toContain('ORU^R01');
  });

  test('generates ORM^O01 message', async () => {
    await generateMessage(window, { messageType: 'ORM^O01' });

    const message = await getMessageText(window);
    expect(message).toContain('ORM^O01');
  });

  test('generates message with different HL7 version', async () => {
    await generateMessage(window, { version: '2.5' });

    const message = await getMessageText(window);
    expect(message).toContain('2.5');
  });

  test('generates message with custom sending application', async () => {
    await generateMessage(window, { sendingApp: 'TESTAPP' });

    const message = await getMessageText(window);
    expect(message).toContain('TESTAPP');
  });

  test('generates message with custom receiving application', async () => {
    await generateMessage(window, { receivingApp: 'RECEIVER' });

    const message = await getMessageText(window);
    expect(message).toContain('RECEIVER');
  });

  test('generates message with production processing id', async () => {
    await generateMessage(window, { processing: 'P' });

    const message = await getMessageText(window);
    expect(message).toContain('|P|');
  });

  test('generates message with custom seed', async () => {
    await generateMessage(window, { sendingApp: 'HIS' });

    const status = await getGenStatus(window);
    expect(status).toContain('seed');
  });

  test('generated message is automatically validated', async () => {
    await generateMessage(window);

    // The generated message should be valid
    const badge = await getValidationBadge(window);
    expect(badge).toBe('Valid');
  });

  test('generates different message types in sequence', async () => {
    // Generate ADT^A01
    await generateMessage(window, { messageType: 'ADT^A01' });
    let message = await getMessageText(window);
    expect(message).toContain('ADT^A01');

    // Generate ORU^R01
    await generateMessage(window, { messageType: 'ORU^R01' });
    message = await getMessageText(window);
    expect(message).toContain('ORU^R01');
  });

  test('shows generation status with seed', async () => {
    await generateMessage(window);

    const status = await getGenStatus(window);
    expect(status).toContain('seed');
  });

  test('generates ACK message type', async () => {
    // First paste a message to ACK
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);

    // Then generate ACK
    await generateMessage(window, { messageType: 'ACK' });

    const message = await getMessageText(window);
    expect(message).toContain('ACK');
  });

  test('generates message with different HL7 versions', async () => {
    const versions = ['2.3', '2.4', '2.5', '2.5.1', '2.6', '2.7', '2.8'];
    for (const version of versions) {
      await generateMessage(window, { version });
      const message = await getMessageText(window);
      expect(message).toContain(version);
    }
  });

  test('favorite button toggles star', async () => {
    // Navigate to generate view
    await window.click('[data-testid="nav-generate"]');
    await window.waitForTimeout(200);

    // Initial state: not favorited (empty star)
    const before = await isFavorited(window);
    expect(before).toBe(false);

    // Click favorite
    await clickFavorite(window);
    const after = await isFavorited(window);
    expect(after).toBe(true);

    // Click again to unfavorite
    await clickFavorite(window);
    const again = await isFavorited(window);
    expect(again).toBe(false);
  });

  test('all empty checkbox is visible', async () => {
    await window.click('[data-testid="nav-generate"]');
    await window.waitForTimeout(200);

    const checkbox = tid(window, 'gen-all-empty');
    await expect(checkbox).toBeVisible();
  });
});
