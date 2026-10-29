const { test, expect } = require('@playwright/test');
const {
  HL7_MESSAGES, waitForWindow, pasteMessage, getFileStatus,
  clearDirtyState, closeApp, tid,
  launchApp, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('File Operations', () => {
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

  test('shows file operation buttons', async () => {
    // Check that file buttons are visible
    const openButton = await tid(window, 'file-open').textContent();
    expect(openButton).toBe('Open...');

    const saveButton = await tid(window, 'file-save').textContent();
    expect(saveButton).toBe('Save');

    const saveAsButton = await tid(window, 'file-save-as').textContent();
    expect(saveAsButton).toBe('Save as...');
  });

  test('shows line ending options', async () => {
    await window.click('[data-testid="nav-settings"]');
    await window.waitForTimeout(200);
    const eolOptions = await tid(window, 'file-eol').locator('option').allTextContents();
    expect(eolOptions).toContain('CR (HL7 standard)');
    expect(eolOptions).toContain('LF');
    expect(eolOptions).toContain('CRLF');
  });

  test('shows encoding options', async () => {
    await window.click('[data-testid="nav-settings"]');
    await window.waitForTimeout(200);
    const encodingOptions = await tid(window, 'file-encoding').locator('option').allTextContents();
    expect(encodingOptions).toContain('UTF-8');
    expect(encodingOptions).toContain('Windows-1252');
  });

  test('shows MLLP wrap checkbox', async () => {
    await window.click('[data-testid="nav-settings"]');
    await window.waitForTimeout(200);
    const mllpCheckbox = tid(window, 'file-mllp');
    await expect(mllpCheckbox).toBeVisible();
  });

  test('changes line ending setting', async () => {
    await window.click('[data-testid="nav-settings"]');
    await window.waitForTimeout(200);
    // Default should be CR
    let eolValue = await tid(window, 'file-eol').inputValue();
    expect(eolValue).toBe('cr');

    // Change to LF
    await tid(window, 'file-eol').selectOption('lf');
    eolValue = await tid(window, 'file-eol').inputValue();
    expect(eolValue).toBe('lf');

    // Change to CRLF
    await tid(window, 'file-eol').selectOption('crlf');
    eolValue = await tid(window, 'file-eol').inputValue();
    expect(eolValue).toBe('crlf');
  });

  test('changes encoding setting', async () => {
    await window.click('[data-testid="nav-settings"]');
    await window.waitForTimeout(200);
    // Default should be UTF-8
    let encodingValue = await tid(window, 'file-encoding').inputValue();
    expect(encodingValue).toBe('utf-8');

    // Change to Windows-1252
    await tid(window, 'file-encoding').selectOption('windows-1252');
    encodingValue = await tid(window, 'file-encoding').inputValue();
    expect(encodingValue).toBe('windows-1252');
  });

  test('toggles MLLP wrap option', async () => {
    await window.click('[data-testid="nav-settings"]');
    await window.waitForTimeout(200);
    // Default should be unchecked
    let mllpChecked = await tid(window, 'file-mllp').isChecked();
    expect(mllpChecked).toBe(false);

    // Check it
    await tid(window, 'file-mllp').check();
    mllpChecked = await tid(window, 'file-mllp').isChecked();
    expect(mllpChecked).toBe(true);

    // Uncheck it
    await tid(window, 'file-mllp').uncheck();
    mllpChecked = await tid(window, 'file-mllp').isChecked();
    expect(mllpChecked).toBe(false);
  });

  test('pastes message and verifies file status', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);

    // The file status should be empty initially
    const fileStatus = await getFileStatus(window);
    expect(fileStatus).toBe('');
  });

  test('shows file format button in toolbar', async () => {
    const formatButton = tid(window, 'file-format');
    await expect(formatButton).toBeVisible();
  });

});
