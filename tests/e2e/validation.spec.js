const { test, expect, _electron: electron } = require('@playwright/test');
const { HL7_MESSAGES, waitForWindow, pasteMessage, clickTab, getValidationResults } = require('./helpers');

test.describe('Message Validation', () => {
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
    const text = await getValidationResults(window);
    expect(text).toContain('Validation results will appear here');
  });

  test('validates valid ADT^A01 message with no errors', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await window.waitForTimeout(500);

    // Should show valid badge
    const badge = await window.locator('#panel-validation .badge.ok').textContent();
    expect(badge).toBe('Valid');

    // Should show message type
    const summary = await window.locator('#panel-validation .summary-text').textContent();
    expect(summary).toContain('ADT');
  });

  test('validates valid ORU^R01 message', async () => {
    await pasteMessage(window, HL7_MESSAGES.ORU_R01);
    await window.waitForTimeout(500);

    const badge = await window.locator('#panel-validation .badge.ok').textContent();
    expect(badge).toBe('Valid');
  });

  test('detects invalid message', async () => {
    await pasteMessage(window, HL7_MESSAGES.INVALID);
    await window.waitForTimeout(500);

    // Should show not valid badge
    const badge = await window.locator('#panel-validation .badge.bad').textContent();
    expect(badge).toBe('Not valid');

    // Should show errors
    const issues = await window.locator('#panel-validation .issue.error').count();
    expect(issues).toBeGreaterThan(0);
  });

  test('detects malformed HL7 message', async () => {
    await pasteMessage(window, HL7_MESSAGES.MALFORMED);
    await window.waitForTimeout(500);

    const badge = await window.locator('#panel-validation .badge.bad').textContent();
    expect(badge).toBe('Not valid');
  });

  test('handles whitespace-only input', async () => {
    await pasteMessage(window, HL7_MESSAGES.WHITESPACE);
    await window.waitForTimeout(500);

    const text = await getValidationResults(window);
    expect(text).toContain('Validation results will appear here');
  });

  test('validates ADT^A02 message', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A02);
    await window.waitForTimeout(500);

    const badge = await window.locator('#panel-validation .badge.ok').textContent();
    expect(badge).toBe('Valid');
  });

  test('validates ORM^O01 message', async () => {
    await pasteMessage(window, HL7_MESSAGES.ORM_O01);
    await window.waitForTimeout(500);

    const badge = await window.locator('#panel-validation .badge.ok').textContent();
    expect(badge).toBe('Valid');
  });

  test('shows issue details with severity and location', async () => {
    await pasteMessage(window, HL7_MESSAGES.INVALID);
    await window.waitForTimeout(500);

    // Each issue should have a severity label and message
    const firstIssue = window.locator('#panel-validation .issue').first();
    const severity = await firstIssue.locator('.severity').textContent();
    expect(severity).toBeTruthy();

    const message = await firstIssue.locator('.issue-message').textContent();
    expect(message).toBeTruthy();
  });

  test('updates validation when message changes', async () => {
    // First paste a valid message
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await window.waitForTimeout(500);
    let badge = await window.locator('#panel-validation .badge.ok').textContent();
    expect(badge).toBe('Valid');

    // Then paste an invalid message
    await pasteMessage(window, HL7_MESSAGES.INVALID);
    await window.waitForTimeout(500);
    badge = await window.locator('#panel-validation .badge.bad').textContent();
    expect(badge).toBe('Not valid');
  });

  test('clears validation when message is cleared', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await window.waitForTimeout(500);

    // Clear the message
    await window.fill('#message', '');
    await window.evaluate(() => {
      document.getElementById('message').dispatchEvent(new Event('input', { bubbles: true }));
    });
    await window.waitForTimeout(500);

    const text = await getValidationResults(window);
    expect(text).toContain('Validation results will appear here');
  });
});
