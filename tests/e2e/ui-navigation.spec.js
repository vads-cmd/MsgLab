const { test, expect } = require('@playwright/test');
const {
  HL7_MESSAGES, waitForWindow, pasteMessage, clickTab, goTo, getValidationBadge,
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

  test('shows the editor view with the sidebar, tabs and editor parts', async () => {
    await expect.soft(tid(window, 'app-title')).toHaveText('MsgLab');
    await expect.soft(tid(window, 'view-editor')).toBeVisible();
    await expect.soft(tid(window, 'sidebar')).toBeVisible();
    for (const id of ['nav-editor', 'nav-generate', 'nav-bulk', 'nav-send', 'nav-settings']) await expect.soft(tid(window, id)).toBeVisible();
    await expect.soft(tid(window, 'nav-send')).toBeEnabled();
    await expect.soft(tid(window, 'tab-validation')).toHaveText('Validation');
    await expect.soft(tid(window, 'tab-explain')).toHaveText('Explain');
    await expect.soft(tid(window, 'message')).toBeVisible();
    await expect.soft(tid(window, 'message')).toHaveAttribute('placeholder', /HL7/);
    await expect.soft(tid(window, 'message-gutter')).toBeVisible();
    await expect.soft(tid(window, 'editor-toolbar')).toBeVisible();
    await expect.soft(tid(window, 'editor-statusbar')).toBeVisible();
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

  test('the sidebar opens the Generate, Bulk and Settings views', async () => {
    await goTo(window, 'generate');
    await expect.soft(tid(window, 'view-generate')).toBeVisible();
    await expect.soft(tid(window, 'gen-submit')).toHaveText('Generate');
    await expect.soft(tid(window, 'gen-type')).toBeVisible();
    await goTo(window, 'bulk');
    await expect.soft(tid(window, 'view-bulk')).toBeVisible();
    await goTo(window, 'settings');
    await expect.soft(tid(window, 'view-settings')).toBeVisible();
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
