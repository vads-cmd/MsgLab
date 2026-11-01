const { test, expect } = require('@playwright/test');
const {
  waitForWindow, openAbout, openAboutByLogo, closeAbout, clearDirtyState, closeApp, tid,
  launchApp, goTo, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('About Dialog', () => {
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

  test('opens from the Help menu and shows the name, version, license, owner and repository', async () => {
    await openAbout(window, electronApp);
    await expect.soft(tid(window, 'about')).toBeVisible();
    await expect.soft(tid(window, 'about-logo')).toBeVisible();
    await expect.soft(tid(window, 'about-facts')).toBeVisible();
    await expect.soft(tid(window, 'about-name')).toContainText('MsgLab');
    await expect.soft(tid(window, 'about-version')).toHaveText(/\d+\.\d+\.\d+/);
    await expect.soft(tid(window, 'about-license-label')).toContainText('License');
    await expect.soft(tid(window, 'about-license')).not.toHaveText('');
    await expect.soft(tid(window, 'about-owner-label')).toContainText('Owner');
    await expect.soft(tid(window, 'about-owner')).not.toHaveText('');
    await expect.soft(tid(window, 'about-repository-label')).toContainText('Repository');
    await expect.soft(tid(window, 'about-repo')).toHaveAttribute('href', /github\.com/);
    await expect.soft(tid(window, 'about-actions')).toBeVisible();
    await expect.soft(tid(window, 'about-close')).toContainText('Close');
  });

  test('closes About dialog with Close button', async () => {
    await openAbout(window, electronApp);
    await closeAbout(window);
    const aboutDialog = tid(window, 'about');
    // The dialog should no longer be visible
    await expect(aboutDialog).not.toBeVisible();
  });

  test.describe('Header logo', () => {
    test('opens the About dialog when clicked', async () => {
      await openAboutByLogo(window);
      await expect(tid(window, 'about')).toBeVisible();
      await expect(tid(window, 'about-name')).toHaveText('MsgLab');
    });

    test('shows the same information as the Help menu', async () => {
      await openAboutByLogo(window);
      const version = await tid(window, 'about-version').textContent();
      const license = await tid(window, 'about-license').textContent();
      await closeAbout(window);
      await openAbout(window, electronApp);
      await expect(tid(window, 'about-version')).toHaveText(version);
      await expect(tid(window, 'about-license')).toHaveText(license);
    });

    test('is a button with an accessible name', async () => {
      const button = tid(window, 'about-open');
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute('aria-label', 'About MsgLab');
      expect(await button.evaluate((node) => node.tagName)).toBe('BUTTON');
    });

    test('opens with the keyboard (Enter on the focused logo)', async () => {
      await tid(window, 'about-open').focus();
      await window.keyboard.press('Enter');
      await expect(tid(window, 'about')).toBeVisible();
    });

    test('can be opened again after it was closed', async () => {
      await openAboutByLogo(window);
      await tid(window, 'about-close').click();
      await expect(tid(window, 'about')).toBeHidden();
      await openAboutByLogo(window);
      await expect(tid(window, 'about')).toBeVisible();
    });

    test('works from every view', async () => {
      for (const view of ['generate', 'bulk', 'settings']) {
        await goTo(window, view);
        await openAboutByLogo(window);
        await expect(tid(window, 'about')).toBeVisible();
        await tid(window, 'about-close').click();
        await expect(tid(window, 'about')).toBeHidden();
      }
    });
  });
});
