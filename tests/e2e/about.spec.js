const { test, expect } = require('@playwright/test');
const {
  waitForWindow, openAbout, openAboutByLogo, closeAbout, getAboutName, getAboutVersion,
  getAboutLicense, getAboutOwner, clearDirtyState, closeApp, tid,
  launchApp, goTo, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('About Dialog', () => {
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

  test('opens About dialog from the Help menu', async () => {
    await openAbout(window, electronApp);
    const aboutDialog = tid(window, 'about');
    await expect(aboutDialog).toBeVisible();
  });

  test('shows application name', async () => {
    await openAbout(window, electronApp);
    const name = await getAboutName(window);
    expect(name.trim()).toContain('MsgLab');
  });

  test('shows application version', async () => {
    await openAbout(window, electronApp);
    const version = await getAboutVersion(window);
    // Version should match semver pattern like "1.0.0"
    expect(version.trim()).toMatch(/\d+\.\d+\.\d+/);
  });

  test('shows license information', async () => {
    await openAbout(window, electronApp);
    const license = await getAboutLicense(window);
    expect(license.trim()).not.toBe('');
  });

  test('shows owner information', async () => {
    await openAbout(window, electronApp);
    const owner = await getAboutOwner(window);
    expect(owner.trim()).not.toBe('');
  });

  test('shows repository link', async () => {
    await openAbout(window, electronApp);
    const repoLink = tid(window, 'about-repo');
    await expect(repoLink).toBeVisible();
    const href = await repoLink.getAttribute('href');
    expect(href).toContain('github.com');
  });

  test('shows license label', async () => {
    await openAbout(window, electronApp);
    const label = tid(window, 'about-license-label');
    await expect(label).toBeVisible();
    expect(await label.textContent()).toContain('License');
  });

  test('shows owner label', async () => {
    await openAbout(window, electronApp);
    const label = tid(window, 'about-owner-label');
    await expect(label).toBeVisible();
    expect(await label.textContent()).toContain('Owner');
  });

  test('shows repository label', async () => {
    await openAbout(window, electronApp);
    const label = tid(window, 'about-repository-label');
    await expect(label).toBeVisible();
    expect(await label.textContent()).toContain('Repository');
  });

  test('closes About dialog with Close button', async () => {
    await openAbout(window, electronApp);
    await closeAbout(window);
    const aboutDialog = tid(window, 'about');
    // The dialog should no longer be visible
    await expect(aboutDialog).not.toBeVisible();
  });

  test('displays logo image', async () => {
    await openAbout(window, electronApp);
    const logo = tid(window, 'about-logo');
    await expect(logo).toBeVisible();
  });

  test('has facts list structure', async () => {
    await openAbout(window, electronApp);
    const facts = tid(window, 'about-facts');
    await expect(facts).toBeVisible();
  });

  test('has close button in actions form', async () => {
    await openAbout(window, electronApp);
    const actions = tid(window, 'about-actions');
    await expect(actions).toBeVisible();
    const closeButton = tid(window, 'about-close');
    await expect(closeButton).toBeVisible();
    expect(await closeButton.textContent()).toContain('Close');
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

    test('is closed by Escape and by a click outside', async () => {
      await openAboutByLogo(window);
      await window.keyboard.press('Escape');
      await expect(tid(window, 'about')).toBeHidden();
      await openAboutByLogo(window);
      await window.mouse.click(5, 5);
      await expect(tid(window, 'about')).toBeHidden();
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
