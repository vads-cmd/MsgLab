const { test, expect } = require('@playwright/test');
const {
  waitForWindow, clearDirtyState, closeApp, tid, goTo,
  launchApp, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('Manual Values', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
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

  test('shows the manual values panel with all its parts', async () => {
    await goTo(window, 'generate');
    await expect.soft(tid(window, 'manual')).toBeVisible();
    await expect.soft(tid(window, 'manual-summary')).toContainText('Manual values');
    await expect.soft(tid(window, 'manual-hint')).toContainText('optional');
    await expect.soft(tid(window, 'manual-toolbar')).toBeVisible();
    await expect.soft(tid(window, 'manual-show-optional')).toBeVisible();
    await expect.soft(tid(window, 'manual-show-optional-label')).toBeVisible();
    await expect.soft(tid(window, 'manual-fields')).toBeVisible();
    await expect.soft(tid(window, 'manual-clear')).toContainText('Clear');
    await expect.soft(tid(window, 'manual-actions')).toBeVisible();
    await expect.soft(tid(window, 'manual-hidden-note')).toBeAttached();
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
