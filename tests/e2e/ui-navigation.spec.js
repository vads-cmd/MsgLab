const { test, expect } = require('@playwright/test');
const {
  HL7_MESSAGES, waitForWindow, pasteMessage, clickTab, getValidationBadge,
  getAppTitle, isSendDisabled, getMessageStats,
  clearDirtyState, closeApp, tid,
  launchApp, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('UI Navigation', () => {
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

  test('shows app title', async () => {
    const title = await getAppTitle(window);
    expect(title).toBe('MsgLab');
  });

  test('shows message textarea', async () => {
    const textarea = tid(window, 'message');
    await expect(textarea).toBeVisible();
  });

  test('shows validation tab by default', async () => {
    const validationTab = tid(window, 'tab-validation');
    await expect(validationTab).toHaveAttribute('aria-selected', 'true');

    const validationPanel = tid(window, 'panel-validation');
    await expect(validationPanel).toBeVisible();

    const explainPanel = tid(window, 'panel-explain');
    await expect(explainPanel).not.toBeVisible();
  });

  test('switches to explain tab', async () => {
    await clickTab(window, 'explain');

    const explainTab = tid(window, 'tab-explain');
    await expect(explainTab).toHaveAttribute('aria-selected', 'true');

    const explainPanel = tid(window, 'panel-explain');
    await expect(explainPanel).toBeVisible();

    const validationPanel = tid(window, 'panel-validation');
    await expect(validationPanel).not.toBeVisible();
  });

  test('switches back to validation tab', async () => {
    await clickTab(window, 'explain');
    await clickTab(window, 'validation');

    const validationTab = tid(window, 'tab-validation');
    await expect(validationTab).toHaveAttribute('aria-selected', 'true');
  });

  test('rapid tab switching', async () => {
    // Switch tabs multiple times quickly
    for (let i = 0; i < 5; i++) {
      await clickTab(window, 'explain');
      await clickTab(window, 'validation');
    }

    // Should end on validation tab
    const validationTab = tid(window, 'tab-validation');
    await expect(validationTab).toHaveAttribute('aria-selected', 'true');
  });

  test('shows sidebar navigation', async () => {
    const sidebar = tid(window, 'sidebar');
    await expect(sidebar).toBeVisible();

    // All nav items should be visible
    await expect(tid(window, 'nav-editor')).toBeVisible();
    await expect(tid(window, 'nav-generate')).toBeVisible();
    await expect(tid(window, 'nav-bulk')).toBeVisible();
    await expect(tid(window, 'nav-send')).toBeVisible();
    await expect(tid(window, 'nav-settings')).toBeVisible();
  });

  test('Send button is disabled', async () => {
    const disabled = await isSendDisabled(window);
    expect(disabled).toBe(true);
  });

  test('shows editor view by default', async () => {
    const editorView = tid(window, 'view-editor');
    await expect(editorView).toBeVisible();
  });

  test('navigates to generate view', async () => {
    await window.click('[data-testid="nav-generate"]');
    await window.waitForTimeout(200);

    const generateView = tid(window, 'view-generate');
    await expect(generateView).toBeVisible();
  });

  test('navigates to bulk view', async () => {
    await window.click('[data-testid="nav-bulk"]');
    await window.waitForTimeout(200);

    const bulkView = tid(window, 'view-bulk');
    await expect(bulkView).toBeVisible();
  });

  test('navigates to settings view', async () => {
    await window.click('[data-testid="nav-settings"]');
    await window.waitForTimeout(200);

    const settingsView = tid(window, 'view-settings');
    await expect(settingsView).toBeVisible();
  });

  test('shows generate button in generate view', async () => {
    await window.click('[data-testid="nav-generate"]');
    await window.waitForTimeout(200);

    const button = tid(window, 'gen-submit');
    await expect(button).toBeVisible();
    const text = await button.textContent();
    expect(text).toBe('Generate');
  });

  test('shows message type dropdown in generate view', async () => {
    await window.click('[data-testid="nav-generate"]');
    await window.waitForTimeout(200);

    const dropdown = tid(window, 'gen-type');
    await expect(dropdown).toBeVisible();
  });

  test('shows manual values panel in generate view', async () => {
    await window.click('[data-testid="nav-generate"]');
    await window.waitForTimeout(200);

    const manual = tid(window, 'manual');
    await expect(manual).toBeVisible();
  });

  test('shows file operation buttons', async () => {
    const openButton = tid(window, 'file-open');
    await expect(openButton).toBeVisible();

    const saveButton = tid(window, 'file-save');
    await expect(saveButton).toBeVisible();

    const saveAsButton = tid(window, 'file-save-as');
    await expect(saveAsButton).toBeVisible();
  });

  test('shows tabs with correct labels', async () => {
    const validationTab = await tid(window, 'tab-validation').textContent();
    expect(validationTab).toBe('Validation');

    const explainTab = await tid(window, 'tab-explain').textContent();
    expect(explainTab).toBe('Explain');
  });

  test('validation tab label updates with problems', async () => {
    await pasteMessage(window, HL7_MESSAGES.INVALID);

    const validationTab = await tid(window, 'tab-validation').textContent();
    expect(validationTab).toContain('Validation (');
  });

  test('shows placeholder text in textarea', async () => {
    const placeholder = await tid(window, 'message').getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
    expect(placeholder).toContain('HL7');
  });

  test('navigates between tabs with message', async () => {
    // Paste a message
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);

    // Switch to explain tab
    await clickTab(window, 'explain');

    // Switch back to validation tab
    await clickTab(window, 'validation');

    // Should still show valid
    const badge = await getValidationBadge(window);
    expect(badge).toBe('Valid');
  });

  test('shows message stats after pasting', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);

    const stats = await getMessageStats(window);
    expect(stats).toContain('segment');
    expect(stats).toContain('character');
  });

  test('shows line numbers gutter', async () => {
    const gutter = tid(window, 'message-gutter');
    await expect(gutter).toBeVisible();
  });

  test('shows editor toolbar', async () => {
    const toolbar = tid(window, 'editor-toolbar');
    await expect(toolbar).toBeVisible();
  });

  test('shows editor status bar', async () => {
    const statusBar = tid(window, 'editor-statusbar');
    await expect(statusBar).toBeVisible();
  });

  test('view switching hides other views', async () => {
    // Navigate to generate
    await window.click('[data-testid="nav-generate"]');
    await window.waitForTimeout(200);

    // Editor view should be hidden
    const editorView = tid(window, 'view-editor');
    await expect(editorView).not.toBeVisible();

    // Generate view should be visible
    const generateView = tid(window, 'view-generate');
    await expect(generateView).toBeVisible();

    // Navigate to bulk
    await window.click('[data-testid="nav-bulk"]');
    await window.waitForTimeout(200);

    // Generate view should be hidden
    await expect(generateView).not.toBeVisible();

    // Bulk view should be visible
    const bulkView = tid(window, 'view-bulk');
    await expect(bulkView).toBeVisible();
  });
});
