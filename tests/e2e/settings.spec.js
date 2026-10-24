const { test, expect, _electron: electron } = require('@playwright/test');
const { waitForWindow, setFileOptions } = require('./helpers');

test.describe('Settings', () => {
  let electronApp;
  let window;

  test.beforeEach(async () => {
    electronApp = await electron.launch({ args: ['.'] });
    window = await waitForWindow(electronApp);
  });

  test.afterEach(async () => {
    await require("./helpers").closeApp(electronApp);
  });

  test('shows default line ending as CR', async () => {
    const eolValue = await window.locator('#file-eol').inputValue();
    expect(eolValue).toBe('cr');
  });

  test('shows default encoding as UTF-8', async () => {
    const encodingValue = await window.locator('#file-encoding').inputValue();
    expect(encodingValue).toBe('utf-8');
  });

  test('shows default MLLP wrap as unchecked', async () => {
    const mllpChecked = await window.locator('#file-mllp').isChecked();
    expect(mllpChecked).toBe(false);
  });

  test('shows default message type as ADT^A01', async () => {
    const messageType = await window.locator('#gen-type').inputValue();
    expect(messageType).toBe('ADT^A01');
  });

  test('shows default HL7 version as 2.5.1', async () => {
    const version = await window.locator('#gen-version').inputValue();
    expect(version).toBe('2.5.1');
  });

  test('shows default processing id as T', async () => {
    const processing = await window.locator('#gen-processing').inputValue();
    expect(processing).toBe('T');
  });

  test('shows default sending application as HIS', async () => {
    const sendingApp = await window.locator('#gen-send-app').inputValue();
    expect(sendingApp).toBe('HIS');
  });

  test('shows default sending facility as MAINHOSP', async () => {
    const sendingFac = await window.locator('#gen-send-fac').inputValue();
    expect(sendingFac).toBe('MAINHOSP');
  });

  test('shows default receiving application as EHR', async () => {
    const receivingApp = await window.locator('#gen-recv-app').inputValue();
    expect(receivingApp).toBe('EHR');
  });

  test('shows default receiving facility as MAINHOSP', async () => {
    const receivingFac = await window.locator('#gen-recv-fac').inputValue();
    expect(receivingFac).toBe('MAINHOSP');
  });

  test('shows all HL7 versions in dropdown', async () => {
    const versions = await window.locator('#gen-version option').allTextContents();
    expect(versions).toContain('2.3');
    expect(versions).toContain('2.4');
    expect(versions).toContain('2.5');
    expect(versions).toContain('2.5.1');
    expect(versions).toContain('2.6');
    expect(versions).toContain('2.7');
    expect(versions).toContain('2.8');
  });

  test('shows all message types in dropdown', async () => {
    const types = await window.locator('#gen-type option').allTextContents();
    expect(types).toContain('ADT^A01 - Admit/Visit Notification');
    expect(types).toContain('ADT^A02 - Transfer a Patient');
    expect(types).toContain('ADT^A03 - Discharge/End Visit');
    expect(types).toContain('ORU^R01 - Unsolicited Observation Result');
    expect(types).toContain('ORM^O01 - General Order Message');
  });

  test('shows processing id options', async () => {
    const processingOptions = await window.locator('#gen-processing option').allTextContents();
    expect(processingOptions).toContain('T - Training/test');
    expect(processingOptions).toContain('P - Production');
    expect(processingOptions).toContain('D - Debugging');
  });

  test('changes line ending setting persists', async () => {
    await window.selectOption('#file-eol', 'lf');
    const eolValue = await window.locator('#file-eol').inputValue();
    expect(eolValue).toBe('lf');

    // Change back to CR
    await window.selectOption('#file-eol', 'cr');
    const eolValue2 = await window.locator('#file-eol').inputValue();
    expect(eolValue2).toBe('cr');
  });

  test('changes encoding setting persists', async () => {
    await window.selectOption('#file-encoding', 'windows-1252');
    const encodingValue = await window.locator('#file-encoding').inputValue();
    expect(encodingValue).toBe('windows-1252');

    // Change back to UTF-8
    await window.selectOption('#file-encoding', 'utf-8');
    const encodingValue2 = await window.locator('#file-encoding').inputValue();
    expect(encodingValue2).toBe('utf-8');
  });

  test('sets all file options using helper', async () => {
    await setFileOptions(window, { eol: 'crlf', encoding: 'windows-1252', mllp: true });

    const eolValue = await window.locator('#file-eol').inputValue();
    expect(eolValue).toBe('crlf');

    const encodingValue = await window.locator('#file-encoding').inputValue();
    expect(encodingValue).toBe('windows-1252');

    const mllpChecked = await window.locator('#file-mllp').isChecked();
    expect(mllpChecked).toBe(true);
  });

  test('shows bulk generation default count as 10', async () => {
    const count = await window.locator('#bulk-count').inputValue();
    expect(count).toBe('10');
  });

  test('shows bulk generation default minutes as 5', async () => {
    const minutes = await window.locator('#bulk-minutes').inputValue();
    expect(minutes).toBe('5');
  });

  test('shows bulk generation default mode as independent', async () => {
    const mode = await window.locator('#bulk-mode').inputValue();
    expect(mode).toBe('independent');
  });

  test('shows bulk patient mode options', async () => {
    const modes = await window.locator('#bulk-mode option').allTextContents();
    expect(modes).toContain('A new patient for every message');
    expect(modes).toContain('Follow each patient through the chosen events');
  });
});
