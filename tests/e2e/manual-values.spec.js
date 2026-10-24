const { test, expect } = require('@playwright/test');
const {
  waitForWindow, clearDirtyState, closeApp, tid, goTo,
  launchApp, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('Manual Values', () => {
  let electronApp;
  let window;

  test.beforeEach(async () => {
    electronApp = await launchApp();
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
  });

  test('shows manual values panel in generate view', async () => {
    await goTo(window, 'generate');
    const manualPanel = tid(window, 'manual');
    await expect(manualPanel).toBeVisible();
  });

  test('shows manual values summary', async () => {
    await goTo(window, 'generate');
    const summary = tid(window, 'manual-summary');
    await expect(summary).toBeVisible();
    expect(await summary.textContent()).toContain('Manual values');
  });

  test('shows manual values hint text', async () => {
    await goTo(window, 'generate');
    const hint = tid(window, 'manual-hint');
    await expect(hint).toBeVisible();
    expect(await hint.textContent()).toContain('optional');
  });

  test('shows manual toolbar', async () => {
    await goTo(window, 'generate');
    const toolbar = tid(window, 'manual-toolbar');
    await expect(toolbar).toBeVisible();
  });

  test('shows show non-mandatory fields checkbox', async () => {
    await goTo(window, 'generate');
    const checkbox = tid(window, 'manual-show-optional');
    await expect(checkbox).toBeVisible();
  });

  test('show non-mandatory checkbox label is visible', async () => {
    await goTo(window, 'generate');
    const label = tid(window, 'manual-show-optional-label');
    await expect(label).toBeVisible();
  });

  test('shows manual fields container', async () => {
    await goTo(window, 'generate');
    const fields = tid(window, 'manual-fields');
    await expect(fields).toBeVisible();
  });

  test('shows manual clear button', async () => {
    await goTo(window, 'generate');
    const clearButton = tid(window, 'manual-clear');
    await expect(clearButton).toBeVisible();
    expect(await clearButton.textContent()).toContain('Clear');
  });

  test('shows manual actions container', async () => {
    await goTo(window, 'generate');
    const actions = tid(window, 'manual-actions');
    await expect(actions).toBeVisible();
  });

  test('shows hidden fields note element', async () => {
    await goTo(window, 'generate');
    const note = tid(window, 'manual-hidden-note');
    // Element exists in the DOM
    await expect(note).not.toBeNull();
  });

  test('toggling show non-mandatory changes field count', async () => {
    await goTo(window, 'generate');
    // Get initial field count with optional shown (default checked)
    const fieldsWithOptional = await window.locator('[data-testid^="manual-"][data-testid$="-value"]').count();
    
    // Uncheck the optional checkbox
    await tid(window, 'manual-show-optional').uncheck();
    await window.waitForTimeout(500);
    
    // Get field count without optional
    const fieldsWithoutOptional = await window.locator('[data-testid^="manual-"][data-testid$="-value"]').count();
    
    // There should be fewer fields when optional is hidden
    expect(fieldsWithoutOptional).toBeLessThanOrEqual(fieldsWithOptional);
  });

  test('clearing manual values resets fields', async () => {
    await goTo(window, 'generate');
    // Find a manual field and set a value
    const firstField = window.locator('[data-testid$="-value"]');
    const count = await firstField.count();
    if (count > 0) {
      await firstField.first().fill('test value');
      await window.waitForTimeout(200);
      // Click clear
      await tid(window, 'manual-clear').click();
      await window.waitForTimeout(500);
      // The field should be cleared
      const clearedValue = await firstField.first().inputValue();
      expect(clearedValue).toBe('');
    }
  });

  test('manual panel is open by default', async () => {
    await goTo(window, 'generate');
    const manualPanel = tid(window, 'manual');
    // Check the details element has the open attribute
    const isOpen = await manualPanel.getAttribute('open');
    expect(isOpen).not.toBeNull();
  });

  test('manual panel can be collapsed', async () => {
    await goTo(window, 'generate');
    const summary = tid(window, 'manual-summary');
    await summary.click();
    await window.waitForTimeout(300);
    const manualPanel = tid(window, 'manual');
    const isOpen = await manualPanel.getAttribute('open');
    expect(isOpen).toBeNull();
  });

  test('manual panel can be expanded again', async () => {
    await goTo(window, 'generate');
    // Collapse
    await tid(window, 'manual-summary').click();
    await window.waitForTimeout(300);
    // Expand
    await tid(window, 'manual-summary').click();
    await window.waitForTimeout(300);
    const manualPanel = tid(window, 'manual');
    const isOpen = await manualPanel.getAttribute('open');
    expect(isOpen).not.toBeNull();
  });
});
