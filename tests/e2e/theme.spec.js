const { test, expect } = require('@playwright/test');
const {
  waitForWindow, setTheme, getTheme, clearDirtyState, closeApp, tid, goTo,
  launchApp, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('Theme Settings', () => {
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

  test('shows theme dropdown in settings', async () => {
    await goTo(window, 'settings');
    const themeSelect = tid(window, 'app-theme');
    await expect(themeSelect).toBeVisible();
  });

  test('theme dropdown has system option', async () => {
    await goTo(window, 'settings');
    const themeSelect = tid(window, 'app-theme');
    await themeSelect.selectOption({ label: 'Same as the system' });
    const value = await themeSelect.inputValue();
    expect(value).toBe('system');
  });

  test('theme dropdown has light option', async () => {
    await goTo(window, 'settings');
    const themeSelect = tid(window, 'app-theme');
    await themeSelect.selectOption({ label: 'Light' });
    const value = await themeSelect.inputValue();
    expect(value).toBe('light');
  });

  test('theme dropdown has dark option', async () => {
    await goTo(window, 'settings');
    const themeSelect = tid(window, 'app-theme');
    await themeSelect.selectOption({ label: 'Dark' });
    const value = await themeSelect.inputValue();
    expect(value).toBe('dark');
  });

  test('theme defaults to system', async () => {
    await goTo(window, 'settings');
    const value = await getTheme(window);
    expect(value).toBe('system');
  });

  test('shows theme label', async () => {
    await goTo(window, 'settings');
    const label = tid(window, 'app-theme-label');
    await expect(label).toBeVisible();
    expect(await label.textContent()).toContain('Theme');
  });

  test('theme appears in appearance card', async () => {
    await goTo(window, 'settings');
    const card = tid(window, 'settings-card-appearance');
    await expect(card).toBeVisible();
  });

  test('appearance card has correct title', async () => {
    await goTo(window, 'settings');
    const title = tid(window, 'settings-card-appearance-title');
    await expect(title).toBeVisible();
    expect(await title.textContent()).toContain('Appearance');
  });

  test('appearance row is visible', async () => {
    await goTo(window, 'settings');
    const row = tid(window, 'settings-appearance-row');
    await expect(row).toBeVisible();
  });

  test('changing theme to light updates value', async () => {
    await goTo(window, 'settings');
    await setTheme(window, 'light');
    const value = await getTheme(window);
    expect(value).toBe('light');
  });

  test('changing theme to dark updates value', async () => {
    await goTo(window, 'settings');
    await setTheme(window, 'dark');
    const value = await getTheme(window);
    expect(value).toBe('dark');
  });

  test('theme can be changed back to system', async () => {
    await goTo(window, 'settings');
    await setTheme(window, 'dark');
    expect(await getTheme(window)).toBe('dark');
    await setTheme(window, 'system');
    expect(await getTheme(window)).toBe('system');
  });
});
