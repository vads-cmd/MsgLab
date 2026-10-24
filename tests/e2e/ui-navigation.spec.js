const { test, expect, _electron: electron } = require('@playwright/test');
const { HL7_MESSAGES, waitForWindow, pasteMessage, clickTab } = require('./helpers');

test.describe('UI Navigation', () => {
  let electronApp;
  let window;

  test.beforeEach(async () => {
    electronApp = await electron.launch({ args: ['.'] });
    window = await waitForWindow(electronApp);
  });

  test.afterEach(async () => {
    await require("./helpers").closeApp(electronApp);
  });

  test('shows app title', async () => {
    const title = await window.locator('h1').textContent();
    expect(title).toBe('HL7 Workbench');
  });

  test('shows message textarea', async () => {
    const textarea = await window.locator('#message').isVisible();
    expect(textarea).toBe(true);
  });

  test('shows validation tab by default', async () => {
    const validationTab = await window.locator('#tab-validation').getAttribute('class');
    expect(validationTab).toContain('active');

    const validationPanel = await window.locator('#panel-validation').isVisible();
    expect(validationPanel).toBe(true);

    const explainPanel = await window.locator('#panel-explain').isVisible();
    expect(explainPanel).toBe(false);
  });

  test('switches to explain tab', async () => {
    await clickTab(window, 'explain');

    const explainTab = await window.locator('#tab-explain').getAttribute('class');
    expect(explainTab).toContain('active');

    const explainPanel = await window.locator('#panel-explain').isVisible();
    expect(explainPanel).toBe(true);

    const validationPanel = await window.locator('#panel-validation').isVisible();
    expect(validationPanel).toBe(false);
  });

  test('switches back to validation tab', async () => {
    await clickTab(window, 'explain');
    await clickTab(window, 'validation');

    const validationTab = await window.locator('#tab-validation').getAttribute('class');
    expect(validationTab).toContain('active');
  });

  test('rapid tab switching', async () => {
    // Switch tabs multiple times quickly
    for (let i = 0; i < 5; i++) {
      await clickTab(window, 'explain');
      await clickTab(window, 'validation');
    }

    // Should end on validation tab
    const validationTab = await window.locator('#tab-validation').getAttribute('class');
    expect(validationTab).toContain('active');
  });

  test('shows generator form', async () => {
    const form = await window.locator('#generator').isVisible();
    expect(form).toBe(true);
  });

  test('shows generate button', async () => {
    const button = await window.locator('#generator button[type="submit"]').textContent();
    expect(button).toBe('Generate');
  });

  test('shows message type dropdown', async () => {
    const dropdown = await window.locator('#gen-type').isVisible();
    expect(dropdown).toBe(true);
  });

  test('shows version dropdown', async () => {
    const dropdown = await window.locator('#gen-version').isVisible();
    expect(dropdown).toBe(true);
  });

  test('shows manual values panel', async () => {
    const manual = await window.locator('#manual').isVisible();
    expect(manual).toBe(true);
  });

  test('shows bulk generation panel', async () => {
    const bulk = await window.locator('#bulk').isVisible();
    expect(bulk).toBe(true);
  });

  test('shows file operation buttons', async () => {
    const openButton = await window.locator('#file-open').isVisible();
    expect(openButton).toBe(true);

    const saveButton = await window.locator('#file-save').isVisible();
    expect(saveButton).toBe(true);

    const saveAsButton = await window.locator('#file-save-as').isVisible();
    expect(saveAsButton).toBe(true);
  });

  test('shows tabs with correct labels', async () => {
    const validationTab = await window.locator('#tab-validation').textContent();
    expect(validationTab).toBe('Validation');

    const explainTab = await window.locator('#tab-explain').textContent();
    expect(explainTab).toBe('Explain');
  });

  test('validation tab label updates with problems', async () => {
    await pasteMessage(window, HL7_MESSAGES.INVALID);
    await window.waitForTimeout(500);

    const validationTab = await window.locator('#tab-validation').textContent();
    expect(validationTab).toContain('Validation (');
  });

  test('shows placeholder text in textarea', async () => {
    const placeholder = await window.locator('#message').getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
    expect(placeholder).toContain('HL7');
  });

  test('navigates between tabs with message', async () => {
    // Paste a message
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await window.waitForTimeout(500);

    // Switch to explain tab
    await clickTab(window, 'explain');
    await window.waitForTimeout(300);

    // Switch back to validation tab
    await clickTab(window, 'validation');
    await window.waitForTimeout(300);

    // Should still show valid
    const badge = await window.locator('#panel-validation .badge.ok').textContent();
    expect(badge).toBe('Valid');
  });
});
