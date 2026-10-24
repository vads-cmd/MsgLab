const { test, expect, _electron: electron } = require('@playwright/test');
const { HL7_MESSAGES, waitForWindow, pasteMessage, clickTab, getValidationResults, getMessageText } = require('./helpers');

test.describe('Error Handling', () => {
  let electronApp;
  let window;

  test.beforeEach(async () => {
    electronApp = await electron.launch({ args: ['.'] });
    window = await waitForWindow(electronApp);
  });

  test.afterEach(async () => {
    await require("./helpers").closeApp(electronApp);
  });

  test('handles empty message gracefully', async () => {
    await pasteMessage(window, HL7_MESSAGES.EMPTY);
    await window.waitForTimeout(500);

    const text = await getValidationResults(window);
    expect(text).toContain('Validation results will appear here');
  });

  test('handles whitespace-only message', async () => {
    await pasteMessage(window, HL7_MESSAGES.WHITESPACE);
    await window.waitForTimeout(500);

    const text = await getValidationResults(window);
    expect(text).toContain('Validation results will appear here');
  });

  test('handles invalid HL7 message', async () => {
    await pasteMessage(window, HL7_MESSAGES.INVALID);
    await window.waitForTimeout(500);

    const badge = await window.locator('#panel-validation .badge.bad').textContent();
    expect(badge).toBe('Not valid');

    // Should show errors
    const issues = await window.locator('#panel-validation .issue.error').count();
    expect(issues).toBeGreaterThan(0);
  });

  test('handles malformed HL7 message', async () => {
    await pasteMessage(window, HL7_MESSAGES.MALFORMED);
    await window.waitForTimeout(500);

    const badge = await window.locator('#panel-validation .badge.bad').textContent();
    expect(badge).toBe('Not valid');
  });

  test('handles single line message', async () => {
    await pasteMessage(window, 'MSH|^~\\&|SENDER|FACILITY|RECEIVER|FACILITY|20261024120000||ADT^A01|MSG0001|T|2.5.1');
    await window.waitForTimeout(500);

    // Should show validation results
    const text = await getValidationResults(window);
    expect(text).toBeTruthy();
  });

  test('handles message with special characters', async () => {
    const specialMessage = [
      'MSH|^~\\&|HIS|MAINHOSP|EHR|MAINHOSP|20261024120000||ADT^A01|MSG0001|T|2.5.1',
      'PID|1||12345^^^HOSP^MR||O\'BRIEN^JOHN^A||19800412|M',
    ].join('\r');

    await pasteMessage(window, specialMessage);
    await window.waitForTimeout(500);

    // Should not crash
    const text = await getValidationResults(window);
    expect(text).toBeTruthy();
  });

  test('handles very long message', async () => {
    // Create a message with many segments
    let longMessage = 'MSH|^~\\&|HIS|MAINHOSP|EHR|MAINHOSP|20261024120000||ADT^A01|MSG0001|T|2.5.1\r';
    longMessage += 'PID|1||12345^^^HOSP^MR||DOE^JOHN^A||19800412|M\r';
    for (let i = 0; i < 100; i++) {
      longMessage += `NK1|${i + 1}|CONTACT^NAME${i}|RELATION\r`;
    }

    await pasteMessage(window, longMessage);
    await window.waitForTimeout(1000);

    // Should not crash
    const text = await getValidationResults(window);
    expect(text).toBeTruthy();
  });

  test('app remains responsive after invalid input', async () => {
    // Paste invalid message
    await pasteMessage(window, HL7_MESSAGES.INVALID);
    await window.waitForTimeout(500);

    // Try to switch tabs - should work
    await clickTab(window, 'explain');
    await window.waitForTimeout(300);

    const explainTab = await window.locator('#tab-explain').getAttribute('class');
    expect(explainTab).toContain('active');
  });

  test('recovers from invalid to valid message', async () => {
    // Paste invalid message
    await pasteMessage(window, HL7_MESSAGES.INVALID);
    await window.waitForTimeout(500);

    let badge = await window.locator('#panel-validation .badge.bad').textContent();
    expect(badge).toBe('Not valid');

    // Paste valid message
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await window.waitForTimeout(500);

    badge = await window.locator('#panel-validation .badge.ok').textContent();
    expect(badge).toBe('Valid');
  });

  test('handles message with only MSH segment', async () => {
    await pasteMessage(window, 'MSH|^~\\&|HIS|MAINHOSP|EHR|MAINHOSP|20261024120000||ADT^A01|MSG0001|T|2.5.1');
    await window.waitForTimeout(500);

    // Should show validation results
    const text = await getValidationResults(window);
    expect(text).toBeTruthy();
  });

  test('handles message with missing required fields', async () => {
    const missingFields = [
      'MSH|^~\\&|HIS|MAINHOSP|EHR|MAINHOSP|20261024120000||ADT^A01|MSG0001|T|2.5.1',
      'PID|1',
    ].join('\r');

    await pasteMessage(window, missingFields);
    await window.waitForTimeout(500);

    // Should show validation results with warnings or errors
    const text = await getValidationResults(window);
    expect(text).toBeTruthy();
  });

  test('handles message with extra segments', async () => {
    const extraSegments = [
      'MSH|^~\\&|HIS|MAINHOSP|EHR|MAINHOSP|20261024120000||ADT^A01|MSG0001|T|2.5.1',
      'PID|1||12345^^^HOSP^MR||DOE^JOHN^A||19800412|M',
      'UNKNOWN|1|2|3',
    ].join('\r');

    await pasteMessage(window, extraSegments);
    await window.waitForTimeout(500);

    // Should not crash
    const text = await getValidationResults(window);
    expect(text).toBeTruthy();
  });

  test('handles message with empty segments', async () => {
    const emptySegments = [
      'MSH|^~\\&|HIS|MAINHOSP|EHR|MAINHOSP|20261024120000||ADT^A01|MSG0001|T|2.5.1',
      'PID|1||12345^^^HOSP^MR||DOE^JOHN^A||19800412|M',
      '',
      'NK1|1|CONTACT|RELATION',
    ].join('\r');

    await pasteMessage(window, emptySegments);
    await window.waitForTimeout(500);

    // Should not crash
    const text = await getValidationResults(window);
    expect(text).toBeTruthy();
  });

  test('handles rapid input changes', async () => {
    // Rapidly change the message
    for (let i = 0; i < 10; i++) {
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await pasteMessage(window, HL7_MESSAGES.INVALID);
    }
    await window.waitForTimeout(500);

    // App should still be responsive
    const textarea = await window.locator('#message').isVisible();
    expect(textarea).toBe(true);
  });

  test('shows error count in validation tab label', async () => {
    await pasteMessage(window, HL7_MESSAGES.INVALID);
    await window.waitForTimeout(500);

    const tabLabel = await window.locator('#tab-validation').textContent();
    expect(tabLabel).toContain('Validation (');
    // Should contain a number
    expect(tabLabel).toMatch(/\d/);
  });

  test('handles message with non-ASCII characters', async () => {
    const nonAsciiMessage = [
      'MSH|^~\\&|HIS|MAINHOSP|EHR|MAINHOSP|20261024120000||ADT^A01|MSG0001|T|2.5.1',
      'PID|1||12345^^^HOSP^MR||MÜLLER^JÖRG^A||19800412|M',
    ].join('\r');

    await pasteMessage(window, nonAsciiMessage);
    await window.waitForTimeout(500);

    // Should not crash
    const text = await getValidationResults(window);
    expect(text).toBeTruthy();
  });

  test('validation tab shows zero problems for valid message', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await window.waitForTimeout(500);

    const tabLabel = await window.locator('#tab-validation').textContent();
    expect(tabLabel).toBe('Validation');
  });
});
