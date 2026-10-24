const { test, expect, _electron: electron } = require('@playwright/test');
const { HL7_MESSAGES, waitForWindow, pasteMessage, clickTab, getExplanationResults } = require('./helpers');

test.describe('Message Explanation', () => {
  let electronApp;
  let window;

  test.beforeEach(async () => {
    electronApp = await electron.launch({ args: ['.'] });
    window = await waitForWindow(electronApp);
  });

  test.afterEach(async () => {
    await require("./helpers").closeApp(electronApp);
  });

  test('shows placeholder on empty message', async () => {
    await clickTab(window, 'explain');
    const text = await getExplanationResults(window);
    expect(text).toContain('The explanation will appear here');
  });

  test('explains valid ADT^A01 message', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');
    await window.waitForTimeout(500);

    // Should show narrative
    const text = await getExplanationResults(window);
    expect(text).toBeTruthy();

    // Should show segment details
    const segments = await window.locator('#panel-explain .segment').count();
    expect(segments).toBeGreaterThan(0);
  });

  test('shows segment names and descriptions', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');
    await window.waitForTimeout(500);

    // Should show MSH segment
    const mshSegment = await window.locator('#panel-explain .segment .seg-name').first().textContent();
    expect(mshSegment).toBe('MSH');
  });

  test('shows field names and values', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');
    await window.waitForTimeout(500);

    // Should show field rows with names and values
    const fieldNames = await window.locator('#panel-explain .f-name').allTextContents();
    expect(fieldNames.length).toBeGreaterThan(0);

    const fieldValues = await window.locator('#panel-explain .f-display').allTextContents();
    expect(fieldValues.length).toBeGreaterThan(0);
  });

  test('explains ORU^R01 message with OBX segment', async () => {
    await pasteMessage(window, HL7_MESSAGES.ORU_R01);
    await clickTab(window, 'explain');
    await window.waitForTimeout(500);

    const text = await getExplanationResults(window);
    expect(text).toBeTruthy();

    // Should have multiple segments
    const segments = await window.locator('#panel-explain .segment').count();
    expect(segments).toBeGreaterThanOrEqual(3);
  });

  test('explains message with component chips', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');
    await window.waitForTimeout(500);

    // Some fields have components that are shown as chips
    const text = await getExplanationResults(window);
    expect(text).toBeTruthy();
  });

  test('explains generated message', async () => {
    // Generate a message first
    await window.selectOption('#gen-type', 'ADT^A01');
    await window.click('#generator button[type="submit"]');
    await window.waitForTimeout(500);

    // Switch to explain tab
    await clickTab(window, 'explain');
    await window.waitForTimeout(500);

    const text = await getExplanationResults(window);
    expect(text).toBeTruthy();
  });

  test('shows field data types', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');
    await window.waitForTimeout(500);

    // Should show data types for fields
    const fieldTypes = await window.locator('#panel-explain .f-type').allTextContents();
    expect(fieldTypes.length).toBeGreaterThan(0);
  });

  test('explains message with multiple segments', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');
    await window.waitForTimeout(500);

    // ADT^A01 has MSH, EVN, PID, PV1 segments
    const segmentNames = await window.locator('#panel-explain .seg-name').allTextContents();
    expect(segmentNames).toContain('MSH');
    expect(segmentNames).toContain('PID');
  });

  test('updates explanation when message changes', async () => {
    // First paste ADT^A01
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');
    await window.waitForTimeout(500);

    let segments = await window.locator('#panel-explain .segment').count();
    expect(segments).toBeGreaterThan(0);

    // Then paste ORU^R01
    await pasteMessage(window, HL7_MESSAGES.ORU_R01);
    await window.waitForTimeout(500);

    segments = await window.locator('#panel-explain .segment').count();
    expect(segments).toBeGreaterThan(0);
  });

  test('shows segment descriptions', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');
    await window.waitForTimeout(500);

    // Each segment should have a description
    const descriptions = await window.locator('#panel-explain .seg-desc').allTextContents();
    expect(descriptions.length).toBeGreaterThan(0);
    // Descriptions should not be empty
    expect(descriptions[0].trim()).not.toBe('');
  });

  test('explains ORM^O01 message', async () => {
    await pasteMessage(window, HL7_MESSAGES.ORM_O01);
    await clickTab(window, 'explain');
    await window.waitForTimeout(500);

    const text = await getExplanationResults(window);
    expect(text).toBeTruthy();

    const segments = await window.locator('#panel-explain .segment').count();
    expect(segments).toBeGreaterThan(0);
  });
});
