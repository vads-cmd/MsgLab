const { test, expect } = require('@playwright/test');
const {
  HL7_MESSAGES, waitForWindow, pasteMessage,
  getValidationBadge, getValidationSummary, getValidationIssueCount,
  getValidationIssueMessage, getValidationIssueSeverity, getPlaceholder,
  clearDirtyState, closeApp, takeScreenshotOnFailure,
  launchApp,
} = require('./helpers');

test.describe('Message Validation', () => {
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

  test('shows placeholder on empty message', async () => {
    const text = await getPlaceholder(window, 'validation');
    expect(text).toContain('Validation results will appear here');
  });

  test('validates valid ADT^A01 message with no errors', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);

    // Should show valid badge
    const badge = await getValidationBadge(window);
    expect(badge).toBe('Valid');

    // Should show message type in summary
    const summary = await getValidationSummary(window);
    expect(summary).toContain('ADT');
  });

  test('validates valid ORU^R01 message', async () => {
    await pasteMessage(window, HL7_MESSAGES.ORU_R01);

    const badge = await getValidationBadge(window);
    expect(badge).toBe('Valid');
  });

  test('detects invalid message', async () => {
    await pasteMessage(window, HL7_MESSAGES.INVALID);

    // Should show not valid badge
    const badge = await getValidationBadge(window);
    expect(badge).toBe('Not valid');

    // Should show errors
    const errorCount = await getValidationIssueCount(window, 'error');
    expect(errorCount).toBeGreaterThan(0);
  });

  test('detects malformed HL7 message', async () => {
    await pasteMessage(window, HL7_MESSAGES.MALFORMED);

    const badge = await getValidationBadge(window);
    expect(badge).toBe('Not valid');
  });

  test('handles whitespace-only input', async () => {
    await pasteMessage(window, HL7_MESSAGES.WHITESPACE);

    const text = await getPlaceholder(window, 'validation');
    expect(text).toContain('Validation results will appear here');
  });

  test('validates ADT^A02 message', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A02);

    const badge = await getValidationBadge(window);
    expect(badge).toBe('Valid');
  });

  test('validates ORM^O01 message', async () => {
    await pasteMessage(window, HL7_MESSAGES.ORM_O01);

    const badge = await getValidationBadge(window);
    expect(badge).toBe('Valid');
  });

  test('shows issue details with severity and location', async () => {
    await pasteMessage(window, HL7_MESSAGES.INVALID);

    // First issue should have a severity and message
    const severity = await getValidationIssueSeverity(window, 1);
    expect(severity).toBeTruthy();

    const message = await getValidationIssueMessage(window, 1);
    expect(message).toBeTruthy();
  });

  test('updates validation when message changes', async () => {
    // First paste a valid message
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    let badge = await getValidationBadge(window);
    expect(badge).toBe('Valid');

    // Then paste an invalid message
    await pasteMessage(window, HL7_MESSAGES.INVALID);
    badge = await getValidationBadge(window);
    expect(badge).toBe('Not valid');
  });

  test('clears validation when message is cleared', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);

    // Clear the message
    await window.fill('[data-testid="message"]', '');
    await window.evaluate(() => {
      document.getElementById('message').dispatchEvent(new Event('input', { bubbles: true }));
    });
    await window.waitForTimeout(500);
    // Clear dirty state so the unsaved-changes modal doesn't block subsequent tests
    await clearDirtyState(window);

    const text = await getPlaceholder(window, 'validation');
    expect(text).toContain('Validation results will appear here');
  });

  test('shows summary with error and warning counts', async () => {
    await pasteMessage(window, HL7_MESSAGES.INVALID);

    const summary = await getValidationSummary(window);
    // Summary should contain error count
    expect(summary).toContain('error');
  });

  test('counts all validation issues', async () => {
    await pasteMessage(window, HL7_MESSAGES.INVALID);

    const totalIssues = await getValidationIssueCount(window);
    expect(totalIssues).toBeGreaterThan(0);
  });
});
