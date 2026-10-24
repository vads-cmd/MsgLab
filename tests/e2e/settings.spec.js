const { test, expect } = require('@playwright/test');
const {
  waitForWindow, setFileOptions, setTheme, getTheme,
  clearDirtyState, closeApp, tid,
  launchApp, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('Settings', () => {
  let electronApp;
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

  test('shows default line ending as CR', async () => {
    await window.click('[data-testid="nav-settings"]');
    await window.waitForTimeout(200);
    const eolValue = await tid(window, 'file-eol').inputValue();
    expect(eolValue).toBe('cr');
  });

  test('shows default encoding as UTF-8', async () => {
    await window.click('[data-testid="nav-settings"]');
    await window.waitForTimeout(200);
    const encodingValue = await tid(window, 'file-encoding').inputValue();
    expect(encodingValue).toBe('utf-8');
  });

  test('shows default MLLP wrap as unchecked', async () => {
    await window.click('[data-testid="nav-settings"]');
    await window.waitForTimeout(200);
    const mllpChecked = await tid(window, 'file-mllp').isChecked();
    expect(mllpChecked).toBe(false);
  });

  test('shows default message type as ADT^A01', async () => {
    await window.click('[data-testid="nav-generate"]');
    await window.waitForTimeout(200);
    const messageType = await tid(window, 'gen-type').inputValue();
    expect(messageType).toBe('ADT^A01');
  });

  test('shows default HL7 version as 2.5.1', async () => {
    await window.click('[data-testid="nav-generate"]');
    await window.waitForTimeout(200);
    const version = await tid(window, 'gen-version').inputValue();
    expect(version).toBe('2.5.1');
  });

  test('shows default processing id as T', async () => {
    await window.click('[data-testid="nav-generate"]');
    await window.waitForTimeout(200);
    const processing = await tid(window, 'gen-processing').inputValue();
    expect(processing).toBe('T');
  });

  test('shows default sending application as HIS', async () => {
    await window.click('[data-testid="nav-generate"]');
    await window.waitForTimeout(200);
    const sendingApp = await tid(window, 'gen-send-app').inputValue();
    expect(sendingApp).toBe('HIS');
  });

  test('shows default sending facility as SENDHOSP', async () => {
    await window.click('[data-testid="nav-generate"]');
    await window.waitForTimeout(200);
    const sendingFac = await tid(window, 'gen-send-fac').inputValue();
    expect(sendingFac).toBe('SENDHOSP');
  });

  test('shows default receiving application as EHR', async () => {
    await window.click('[data-testid="nav-generate"]');
    await window.waitForTimeout(200);
    const receivingApp = await tid(window, 'gen-recv-app').inputValue();
    expect(receivingApp).toBe('EHR');
  });

  test('shows default receiving facility as GETHOSP', async () => {
    await window.click('[data-testid="nav-generate"]');
    await window.waitForTimeout(200);
    const receivingFac = await tid(window, 'gen-recv-fac').inputValue();
    expect(receivingFac).toBe('GETHOSP');
  });

  test('shows all HL7 versions in dropdown', async () => {
    await window.click('[data-testid="nav-generate"]');
    await window.waitForTimeout(200);
    const versions = await tid(window, 'gen-version').locator('option').allTextContents();
    expect(versions).toContain('2.3');
    expect(versions).toContain('2.4');
    expect(versions).toContain('2.5');
    expect(versions).toContain('2.5.1');
    expect(versions).toContain('2.6');
    expect(versions).toContain('2.7');
    expect(versions).toContain('2.8');
  });

  test('shows all message types in dropdown', async () => {
    await window.click('[data-testid="nav-generate"]');
    await window.waitForTimeout(200);
    const types = await tid(window, 'gen-type').locator('option').allTextContents();
    expect(types).toContain('ADT^A01 - Admit/Visit Notification');
    expect(types).toContain('ADT^A02 - Transfer a Patient');
    expect(types).toContain('ADT^A03 - Discharge/End Visit');
    expect(types).toContain('ADT^A08 - Update Patient Information');
    expect(types).toContain('ADT^A18 - Merge Patient Information');
    expect(types).toContain('ADT^A40 - Merge Patient - Patient Identifier List');
    expect(types).toContain('ADT^A60 - Update Adverse Reaction Information');
    expect(types).toContain('ORU^R01 - Unsolicited Observation Result');
    expect(types).toContain('ORM^O01 - General Order Message');
  });

  test('shows processing id options', async () => {
    await window.click('[data-testid="nav-generate"]');
    await window.waitForTimeout(200);
    const processingOptions = await tid(window, 'gen-processing').locator('option').allTextContents();
    expect(processingOptions).toContain('T - Training/test');
    expect(processingOptions).toContain('P - Production');
    expect(processingOptions).toContain('D - Debugging');
  });

  test('changes line ending setting persists', async () => {
    await window.click('[data-testid="nav-settings"]');
    await window.waitForTimeout(200);
    await tid(window, 'file-eol').selectOption('lf');
    const eolValue = await tid(window, 'file-eol').inputValue();
    expect(eolValue).toBe('lf');

    // Change back to CR
    await tid(window, 'file-eol').selectOption('cr');
    const eolValue2 = await tid(window, 'file-eol').inputValue();
    expect(eolValue2).toBe('cr');
  });

  test('changes encoding setting persists', async () => {
    await window.click('[data-testid="nav-settings"]');
    await window.waitForTimeout(200);
    await tid(window, 'file-encoding').selectOption('windows-1252');
    const encodingValue = await tid(window, 'file-encoding').inputValue();
    expect(encodingValue).toBe('windows-1252');

    // Change back to UTF-8
    await tid(window, 'file-encoding').selectOption('utf-8');
    const encodingValue2 = await tid(window, 'file-encoding').inputValue();
    expect(encodingValue2).toBe('utf-8');
  });

  test('sets all file options using helper', async () => {
    await setFileOptions(window, { eol: 'crlf', encoding: 'windows-1252', mllp: true });

    const eolValue = await tid(window, 'file-eol').inputValue();
    expect(eolValue).toBe('crlf');

    const encodingValue = await tid(window, 'file-encoding').inputValue();
    expect(encodingValue).toBe('windows-1252');

    const mllpChecked = await tid(window, 'file-mllp').isChecked();
    expect(mllpChecked).toBe(true);
  });

  test('shows bulk generation default count as 10', async () => {
    await window.click('[data-testid="nav-bulk"]');
    await window.waitForTimeout(200);
    const count = await tid(window, 'bulk-count').inputValue();
    expect(count).toBe('10');
  });

  test('shows bulk generation default minutes as 5', async () => {
    await window.click('[data-testid="nav-bulk"]');
    await window.waitForTimeout(200);
    const minutes = await tid(window, 'bulk-minutes').inputValue();
    expect(minutes).toBe('5');
  });

  test('shows bulk generation default mode as independent', async () => {
    await window.click('[data-testid="nav-bulk"]');
    await window.waitForTimeout(200);
    const mode = await tid(window, 'bulk-mode').inputValue();
    expect(mode).toBe('independent');
  });

  test('shows bulk patient mode options', async () => {
    await window.click('[data-testid="nav-bulk"]');
    await window.waitForTimeout(200);
    const modes = await tid(window, 'bulk-mode').locator('option').allTextContents();
    expect(modes).toContain('A new patient for every message');
    expect(modes).toContain('Follow each patient through the chosen events');
  });

  test('shows theme setting with default system', async () => {
    await window.click('[data-testid="nav-settings"]');
    await window.waitForTimeout(200);
    const theme = await getTheme(window);
    expect(theme).toBe('system');
  });

  test('shows all theme options', async () => {
    await window.click('[data-testid="nav-settings"]');
    await window.waitForTimeout(200);
    const themes = await tid(window, 'app-theme').locator('option').allTextContents();
    expect(themes).toContain('Same as the system');
    expect(themes).toContain('Light');
    expect(themes).toContain('Dark');
  });

  test('changes theme to light', async () => {
    await setTheme(window, 'light');
    const theme = await getTheme(window);
    expect(theme).toBe('light');
  });

  test('changes theme to dark', async () => {
    await setTheme(window, 'dark');
    const theme = await getTheme(window);
    expect(theme).toBe('dark');
  });

  test('shows settings cards', async () => {
    await window.click('[data-testid="nav-settings"]');
    await window.waitForTimeout(200);
    await expect(tid(window, 'settings-card-appearance')).toBeVisible();
    await expect(tid(window, 'settings-card-format')).toBeVisible();
    await expect(tid(window, 'settings-card-folders')).toBeVisible();
  });

  test('shows folder settings', async () => {
    await window.click('[data-testid="nav-settings"]');
    await window.waitForTimeout(200);
    await expect(tid(window, 'folder-save')).toBeVisible();
    await expect(tid(window, 'folder-export')).toBeVisible();
    await expect(tid(window, 'folder-save-choose')).toBeVisible();
    await expect(tid(window, 'folder-export-choose')).toBeVisible();
  });
});
