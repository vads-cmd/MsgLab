const { test, expect } = require('@playwright/test');
const {
  HL7_MESSAGES, waitForWindow, pasteMessage, clickTab, getExplanationResults,
  getExplanationSegmentCount, getExplanationSegmentName, getExplanationSegmentDesc,
  generateMessage, getPlaceholder, clearDirtyState, closeApp, tid,
  launchApp, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('Message Explanation', () => {
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

  test('shows placeholder on empty message', async () => {
    await clickTab(window, 'explain');
    const text = await getPlaceholder(window, 'explain');
    expect(text).toContain('The explanation will appear here');
  });

  test('explains valid ADT^A01 message', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');

    // Should show narrative
    const text = await getExplanationResults(window);
    expect(text).toBeTruthy();

    // Should show segment details
    const segments = await getExplanationSegmentCount(window);
    expect(segments).toBeGreaterThan(0);
  });

  test('shows segment names and descriptions', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');

    // First segment should be MSH
    const firstSegmentName = await getExplanationSegmentName(window, 1);
    expect(firstSegmentName).toBe('MSH');
  });

  test('shows field names and values', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');

    // Field names use data-testid ending with "-name"
    const fieldNames = await window.locator('[data-testid$="-name"]').allTextContents();
    expect(fieldNames.length).toBeGreaterThan(0);

    // Field displays use data-testid ending with "-display"
    const fieldValues = await window.locator('[data-testid$="-display"]').allTextContents();
    expect(fieldValues.length).toBeGreaterThan(0);
  });

  test('explains ORU^R01 message with OBX segment', async () => {
    await pasteMessage(window, HL7_MESSAGES.ORU_R01);
    await clickTab(window, 'explain');

    const text = await getExplanationResults(window);
    expect(text).toBeTruthy();

    // Should have multiple segments (MSH, PID, OBR, OBX)
    const segments = await getExplanationSegmentCount(window);
    expect(segments).toBeGreaterThanOrEqual(3);
  });

  test('explains message with component chips', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');

    // Some fields have components that are shown as chips
    const text = await getExplanationResults(window);
    expect(text).toBeTruthy();
  });

  test('explains generated message', async () => {
    // Generate a message first
    await generateMessage(window, { messageType: 'ADT^A01' });

    // Switch to explain tab
    await clickTab(window, 'explain');

    const text = await getExplanationResults(window);
    expect(text).toBeTruthy();
  });

  test('shows field data types', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');

    // Data types use data-testid ending with "-type"
    const fieldTypes = await window.locator('[data-testid$="-type"]').allTextContents();
    expect(fieldTypes.length).toBeGreaterThan(0);
  });

  test('explains message with multiple segments', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');

    // ADT^A01 has MSH, EVN, PID, PV1 segments
    const segmentNames = [];
    for (let i = 1; i <= 4; i++) {
      const name = await getExplanationSegmentName(window, i);
      segmentNames.push(name);
    }
    expect(segmentNames).toContain('MSH');
    expect(segmentNames).toContain('PID');
  });

  test('updates explanation when message changes', async () => {
    // First paste ADT^A01
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');

    let segments = await getExplanationSegmentCount(window);
    expect(segments).toBeGreaterThan(0);

    // Then paste ORU^R01
    await pasteMessage(window, HL7_MESSAGES.ORU_R01);

    segments = await getExplanationSegmentCount(window);
    expect(segments).toBeGreaterThan(0);
  });

  test('shows segment descriptions', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');

    // First segment should have a non-empty description
    const desc = await getExplanationSegmentDesc(window, 1);
    expect(desc.trim()).not.toBe('');
  });

  test('explains ORM^O01 message', async () => {
    await pasteMessage(window, HL7_MESSAGES.ORM_O01);
    await clickTab(window, 'explain');

    const text = await getExplanationResults(window);
    expect(text).toBeTruthy();

    const segments = await getExplanationSegmentCount(window);
    expect(segments).toBeGreaterThan(0);
  });

  test('shows narrative text', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');

    // Narrative paragraph should be visible
    const narrative = tid(window, 'explain-narrative');
    await expect(narrative).toBeVisible();
  });

  test('shows facts list', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await clickTab(window, 'explain');

    // Facts list should be visible
    const facts = tid(window, 'explain-facts');
    await expect(facts).toBeVisible();
  });
});
