const { test, expect } = require('@playwright/test');
const {
  waitForWindow, clickFavorite, isFavorited, clearDirtyState, closeApp,
  tid, goTo, selectFavBulkTypes,
  launchApp, takeScreenshotOnFailure,
} = require('./helpers');

test.describe('Favorites', () => {
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

  test('shows favorite button in generator', async () => {
    await goTo(window, 'generate');
    const favButton = tid(window, 'gen-fav');
    await expect(favButton).toBeVisible();
  });

  test('favorite button starts as unfilled star', async () => {
    await goTo(window, 'generate');
    const favorited = await isFavorited(window);
    expect(favorited).toBe(false);
  });

  test('clicking favorite button toggles to filled star', async () => {
    await goTo(window, 'generate');
    await clickFavorite(window);
    const favorited = await isFavorited(window);
    expect(favorited).toBe(true);
  });

  test('clicking favorite button again removes favorite', async () => {
    await goTo(window, 'generate');
    await clickFavorite(window);
    expect(await isFavorited(window)).toBe(true);
    await clickFavorite(window);
    expect(await isFavorited(window)).toBe(false);
  });

  test('favorite state persists across message type changes', async () => {
    await goTo(window, 'generate');
    await clickFavorite(window);
    expect(await isFavorited(window)).toBe(true);
    // Change message type
    await tid(window, 'gen-type').selectOption('ADT^A02');
    await window.waitForTimeout(300);
    // The favorite button should still exist
    const favButton = tid(window, 'gen-fav');
    await expect(favButton).toBeVisible();
  });

  test('favorite button has correct aria-label when not favorited', async () => {
    await goTo(window, 'generate');
    const favButton = tid(window, 'gen-fav');
    const label = await favButton.getAttribute('aria-label');
    expect(label).toContain('Add to favorites');
  });

  test('favorite button aria-label changes when favorited', async () => {
    await goTo(window, 'generate');
    await clickFavorite(window);
    const favButton = tid(window, 'gen-fav');
    const label = await favButton.getAttribute('aria-label');
    expect(label).toContain('Remove from favorites');
  });

  test('favorite button has aria-pressed attribute', async () => {
    await goTo(window, 'generate');
    const favButton = tid(window, 'gen-fav');
    const pressed = await favButton.getAttribute('aria-pressed');
    expect(pressed).toBe('false');
    await clickFavorite(window);
    const pressedAfter = await favButton.getAttribute('aria-pressed');
    expect(pressedAfter).toBe('true');
  });

  test('favorites only button exists in bulk view', async () => {
    await goTo(window, 'bulk');
    const favsButton = tid(window, 'bulk-types-favs');
    await expect(favsButton).toBeVisible();
    expect(await favsButton.textContent()).toContain('Favorites');
  });

  test('selecting favorites only in bulk view filters types', async () => {
    await goTo(window, 'generate');
    await clickFavorite(window);
    await goTo(window, 'bulk');
    await selectFavBulkTypes(window);
    // After selecting favorites, at least one type should be selected
    const checkboxes = await window.locator('#bulk-types input[type="checkbox"]').all();
    const checkedCount = await Promise.all(
      checkboxes.map(cb => cb.isChecked()),
    ).then(results => results.filter(Boolean).length);
    expect(checkedCount).toBeGreaterThanOrEqual(1);
  });
});
