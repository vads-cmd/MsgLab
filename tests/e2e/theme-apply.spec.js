const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const {
  launchApp, closeApp, waitForWindow, clearDirtyState, makeTempDir, removeTempDir, setTheme, goTo, tid,
  takeScreenshotOnFailure,
} = require('./helpers');

// The theme dropdown must really change the look of the app (not only its value), and be remembered.

test.describe('Theme', () => {
  let electronApp;
  let window;
  let dataDir;

  const start = async () => {
    electronApp = await launchApp({ userDataDir: dataDir });
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    // Playwright pins the page to a light colour scheme; let the page follow the real one
    await window.emulateMedia({ colorScheme: null });
  };
  const prefersDark = () => window.evaluate(() => globalThis.matchMedia('(prefers-color-scheme: dark)').matches);
  const background = () => window.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const darkInApp = () => electronApp.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors);
  const themeSource = () => electronApp.evaluate(({ nativeTheme }) => nativeTheme.themeSource);

  test.beforeEach(async () => {
    dataDir = makeTempDir();
    await start();
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
    removeTempDir(dataDir);
  });

  test('Dark makes the page dark', async () => {
    await setTheme(window, 'dark');
    await expect.poll(prefersDark).toBe(true);
    expect(await themeSource()).toBe('dark');
    expect(await darkInApp()).toBe(true);
  });

  test('Light makes the page light', async () => {
    await setTheme(window, 'light');
    await expect.poll(prefersDark).toBe(false);
    expect(await themeSource()).toBe('light');
    expect(await darkInApp()).toBe(false);
  });

  test('Light and Dark use different background colours', async () => {
    await setTheme(window, 'light');
    await expect.poll(prefersDark).toBe(false);
    const light = await background();
    await setTheme(window, 'dark');
    await expect.poll(prefersDark).toBe(true);
    await expect.poll(background).not.toBe(light);
  });

  test('Same as the system hands the choice back to the system', async () => {
    await setTheme(window, 'dark');
    await expect.poll(themeSource).toBe('dark');
    await setTheme(window, 'system');
    await expect.poll(themeSource).toBe('system');
  });

  test('the choice is applied again after a restart', async () => {
    await setTheme(window, 'dark');
    await expect.poll(themeSource).toBe('dark');
    // the choice is saved a moment after it is made
    await expect.poll(() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).controls['app-theme'];
      } catch {
        return null; // not written yet
      }
    }).toBe('dark');
    await closeApp(electronApp, { keepData: true });
    await start();
    expect(await themeSource()).toBe('dark');
    expect(await prefersDark()).toBe(true);
    await goTo(window, 'settings');
    await expect(tid(window, 'app-theme')).toHaveValue('dark');
  });
});
