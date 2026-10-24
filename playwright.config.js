// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  use: {
    actionTimeout: 10000,
    trace: 'on-first-retry',
  },
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['allure-playwright', {
      resultsDir: 'allure-results',
    }],
  ],
});
