const { test, expect } = require('@playwright/test');
const {
  waitForWindow, goTo, setFileOptions, clearDirtyState, closeApp, tid,
  launchApp, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('Settings', () => {
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

  test('shows the generator defaults', async () => {
    await goTo(window, 'generate');
    for (const [id, value] of [
      ['gen-type', 'ADT^A01'], ['gen-version', '2.5.1'], ['gen-processing', 'T'],
      ['gen-send-app', 'HIS'], ['gen-send-fac', 'SENDHOSP'], ['gen-recv-app', 'EHR'], ['gen-recv-fac', 'GETHOSP'],
    ]) {
      await expect.soft(tid(window, id)).toHaveValue(value);
    }
  });

  test('offers all HL7 versions, message types and processing ids', async () => {
    await goTo(window, 'generate');
    const optionsOf = (id) => tid(window, id).locator('option').allTextContents();
    const versions = await optionsOf('gen-version');
    for (const version of ['2.3', '2.4', '2.5', '2.5.1', '2.6', '2.7', '2.8']) expect.soft(versions).toContain(version);
    const types = await optionsOf('gen-type');
    for (const type of [
      'ADT^A01 - Admit/Visit Notification', 'ADT^A02 - Transfer a Patient', 'ADT^A03 - Discharge/End Visit',
      'ADT^A08 - Update Patient Information', 'ADT^A18 - Merge Patient Information',
      'ADT^A40 - Merge Patient - Patient Identifier List', 'ADT^A60 - Update Adverse Reaction Information',
      'ORU^R01 - Unsolicited Observation Result', 'ORM^O01 - General Order Message',
    ]) {
      expect.soft(types).toContain(type);
    }
    const processing = await optionsOf('gen-processing');
    for (const option of ['T - Training/test', 'P - Production', 'D - Debugging']) expect.soft(processing).toContain(option);
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

  test('shows the bulk generation defaults and patient modes', async () => {
    await goTo(window, 'bulk');
    await expect.soft(tid(window, 'bulk-count')).toHaveValue('10');
    await expect.soft(tid(window, 'bulk-minutes')).toHaveValue('5');
    await expect.soft(tid(window, 'bulk-mode')).toHaveValue('independent');
    const modes = await tid(window, 'bulk-mode').locator('option').allTextContents();
    expect.soft(modes).toContain('A new patient for every message');
    expect.soft(modes).toContain('Follow each patient through the chosen events');
  });

  test('shows settings cards', async () => {
    await window.click('[data-testid="nav-settings"]');
    await window.waitForTimeout(200);
    await expect(tid(window, 'settings-card-appearance')).toBeVisible();
    await expect(tid(window, 'settings-card-format')).toBeVisible();
    await expect(tid(window, 'settings-card-folders')).toBeVisible();
  });

});
