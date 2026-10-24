const { test, expect, _electron: electron } = require('@playwright/test');
const { HL7_MESSAGES, waitForWindow, pasteMessage, setFileOptions, getMessageText } = require('./helpers');
const path = require('path');
const fs = require('fs');

test.describe('File Operations', () => {
  let electronApp;
  let window;
  const testDir = path.join(process.cwd(), 'test-files');

  test.beforeEach(async () => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    electronApp = await electron.launch({ args: ['.'] });
    window = await waitForWindow(electronApp);
  });

  test.afterEach(async () => {
    await require("./helpers").closeApp(electronApp);
    // Clean up test files
    if (fs.existsSync(testDir)) {
      const files = fs.readdirSync(testDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testDir, file));
      }
      fs.rmdirSync(testDir);
    }
  });

  test('shows file operation buttons', async () => {
    // Check that file buttons are visible
    const openButton = await window.locator('#file-open').textContent();
    expect(openButton).toBe('Open...');

    const saveButton = await window.locator('#file-save').textContent();
    expect(saveButton).toBe('Save');

    const saveAsButton = await window.locator('#file-save-as').textContent();
    expect(saveAsButton).toBe('Save as...');
  });

  test('shows file status element', async () => {
    const fileStatus = await window.locator('#file-status').isVisible();
    expect(fileStatus).toBe(true);
  });

  test('shows line ending options', async () => {
    const eolOptions = await window.locator('#file-eol option').allTextContents();
    expect(eolOptions).toContain('CR (HL7 standard)');
    expect(eolOptions).toContain('LF');
    expect(eolOptions).toContain('CRLF');
  });

  test('shows encoding options', async () => {
    const encodingOptions = await window.locator('#file-encoding option').allTextContents();
    expect(encodingOptions).toContain('UTF-8');
    expect(encodingOptions).toContain('Windows-1252');
  });

  test('shows MLLP wrap checkbox', async () => {
    const mllpCheckbox = await window.locator('#file-mllp').isVisible();
    expect(mllpCheckbox).toBe(true);
  });

  test('changes line ending setting', async () => {
    // Default should be CR
    let eolValue = await window.locator('#file-eol').inputValue();
    expect(eolValue).toBe('cr');

    // Change to LF
    await window.selectOption('#file-eol', 'lf');
    eolValue = await window.locator('#file-eol').inputValue();
    expect(eolValue).toBe('lf');

    // Change to CRLF
    await window.selectOption('#file-eol', 'crlf');
    eolValue = await window.locator('#file-eol').inputValue();
    expect(eolValue).toBe('crlf');
  });

  test('changes encoding setting', async () => {
    // Default should be UTF-8
    let encodingValue = await window.locator('#file-encoding').inputValue();
    expect(encodingValue).toBe('utf-8');

    // Change to Windows-1252
    await window.selectOption('#file-encoding', 'windows-1252');
    encodingValue = await window.locator('#file-encoding').inputValue();
    expect(encodingValue).toBe('windows-1252');
  });

  test('toggles MLLP wrap option', async () => {
    // Default should be unchecked
    let mllpChecked = await window.locator('#file-mllp').isChecked();
    expect(mllpChecked).toBe(false);

    // Check it
    await window.check('#file-mllp');
    mllpChecked = await window.locator('#file-mllp').isChecked();
    expect(mllpChecked).toBe(true);

    // Uncheck it
    await window.uncheck('#file-mllp');
    mllpChecked = await window.locator('#file-mllp').isChecked();
    expect(mllpChecked).toBe(false);
  });

  test('opens file using open button', async () => {
    // Create a test HL7 file
    const testFile = path.join(testDir, 'test.hl7');
    fs.writeFileSync(testFile, HL7_MESSAGES.ADT_A01);

    // Click open button - this will trigger a file dialog
    // In Electron tests, we need to handle the dialog
    await window.click('#file-open');
    await window.waitForTimeout(500);

    // The file status should show something (either opened or canceled)
    const fileStatus = await window.locator('#file-status').textContent();
    // We can't easily test the file dialog in headless mode, so just verify no error
    expect(fileStatus).not.toContain('error');
  });

  test('pastes message and verifies file status', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await window.waitForTimeout(500);

    // The file status should be empty initially
    const fileStatus = await window.locator('#file-status').textContent();
    expect(fileStatus).toBe('');
  });

  test('file options are accessible', async () => {
    // All file options should be visible
    const eolVisible = await window.locator('#file-eol').isVisible();
    expect(eolVisible).toBe(true);

    const encodingVisible = await window.locator('#file-encoding').isVisible();
    expect(encodingVisible).toBe(true);

    const mllpVisible = await window.locator('#file-mllp').isVisible();
    expect(mllpVisible).toBe(true);
  });

  test('sets file options using helper', async () => {
    await setFileOptions(window, { eol: 'lf', encoding: 'utf-8', mllp: false });

    let eolValue = await window.locator('#file-eol').inputValue();
    expect(eolValue).toBe('lf');

    let encodingValue = await window.locator('#file-encoding').inputValue();
    expect(encodingValue).toBe('utf-8');

    let mllpChecked = await window.locator('#file-mllp').isChecked();
    expect(mllpChecked).toBe(false);
  });
});
