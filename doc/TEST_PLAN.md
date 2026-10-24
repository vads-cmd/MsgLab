# HL7Tool Test Plan

## Overview

This document describes the testing strategy for the HL7Tool Electron desktop application — a tool for generating, validating, and explaining HL7 v2 messages.

The project uses a **multi-level testing approach**:

1. **Unit tests** — Fast, isolated tests for the HL7 core library
2. **E2E (End-to-End) tests** — Full application tests using Playwright's Electron API

## Test Levels

### Unit Tests

**Location:** `test/` directory  
**Runner:** Node.js built-in test runner (`node --test`)  
**Count:** 121 tests

Unit tests cover the HL7 core library modules in isolation:

| Module | File | Tests | Coverage |
|--------|------|-------|----------|
| Parser | `test/parser.test.js` | 25 | Message parsing, segment extraction, field splitting |
| Validator | `test/validator.test.js` | 30 | Validation rules, error detection, warnings |
| Generator | `test/generator.test.js` | 25 | Message generation, field population, versions |
| Explainer | `test/explainer.test.js` | 20 | Field explanations, segment narratives |
| Bulk Generation | `test/bulk.test.js` | 15 | Multi-message generation, patient journeys |
| File I/O | `test/files.test.js` | 6 | Encoding, line endings, MLLP wrapping |
| Golden Tests | `test/golden.test.js` | 20 | Regression tests against saved messages |

**Run:** `npm test`

### E2E Tests

**Location:** `tests/e2e/` directory  
**Runner:** Playwright Test with Electron API  
**Reporter:** Allure (`allure-playwright`)  
**Browser:** Electron (real desktop app, not browser emulation)

E2E tests cover all user-visible features by launching the actual Electron app and interacting with the UI:

| Feature | Test File | Description |
|---------|-----------|-------------|
| Validation | `validation.spec.js` | Paste HL7 messages, verify validation results |
| Generation | `generation.spec.js` | Generate messages with different types and settings |
| Explanation | `explanation.spec.js` | Verify field names, values, and narratives |
| Bulk Generation | `bulk-generation.spec.js` | Generate multiple messages, verify results table |
| File Operations | `file-operations.spec.js` | Save and open HL7 files |
| Clipboard | `clipboard.spec.js` | Copy messages to clipboard |
| UI Navigation | `ui-navigation.spec.js` | Tab switching, menu interactions |
| Error Handling | `error-handling.spec.js` | Invalid input, malformed HL7, error recovery |
| Settings | `settings.spec.js` | Line endings, encoding, separator configuration |

**Run:** `npm run test:e2e`

### Combined Test Suite

Run all tests (unit + E2E):

```bash
npm run test:all
```

## Test Coverage Matrix

| Feature | Unit Tests | E2E Tests |
|---------|-----------|-----------|
| Parser | ✅ 25 tests | ✅ Via validation & explanation |
| Validator | ✅ 30 tests | ✅ Dedicated test file |
| Generator | ✅ 25 tests | ✅ Dedicated test file |
| Explainer | ✅ 20 tests | ✅ Dedicated test file |
| Bulk Generation | ✅ 15 tests | ✅ Dedicated test file |
| File I/O | ✅ 6 tests | ✅ Dedicated test file |
| UI/UX | ❌ | ✅ Dedicated test file |
| Clipboard | ❌ | ✅ Dedicated test file |
| Settings | ❌ | ✅ Dedicated test file |
| Error Handling | Partial | ✅ Dedicated test file |

## Test Data

### HL7 Test Messages

All E2E tests use predefined HL7 messages defined in `tests/e2e/helpers.js`:

- **ADT^A01** — Valid admit/visit notification with PID and PV1 segments
- **ADT^A02** — Valid transfer patient message
- **ORU^R01** — Valid unsolicited observation result with OBX
- **ORM^O01** — Valid order message with OBR
- **Invalid** — Plain text that is not HL7
- **Malformed** — Partial HL7 with missing required segments
- **Empty** — Empty string for edge case testing

### Test Helpers

`tests/e2e/helpers.js` provides shared utilities:

- `waitForWindow(electronApp)` — Wait for the Electron window to load
- `pasteMessage(window, message)` — Paste HL7 into the textarea
- `clickTab(window, tabName)` — Switch between Validation and Explain tabs
- `generateMessage(window, options)` — Generate a message with settings
- `configureBulkGeneration(window, options)` — Set up bulk generation
- `setFileOptions(window, options)` — Configure file save options

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test              # Unit tests
      - run: npm run test:e2e      # E2E tests
```

### Local Development

```bash
# Run unit tests only
npm test

# Run E2E tests only
npm run test:e2e

# Run all tests
npm run test:all

# Run E2E tests with UI (for debugging)
npx playwright test --ui

# Run a single E2E test file
npx playwright test tests/e2e/validation.spec.js

# Run E2E tests in debug mode
npx playwright test --debug

# Generate Allure report
npm run allure:generate

# Serve Allure report (local web server)
npm run allure:serve

# Open Allure report in browser
npm run allure:open
```

## Test Maintenance

### Adding New Tests

1. **Unit tests** — Add to the relevant `test/*.test.js` file following the existing patterns
2. **E2E tests** — Add to the relevant `tests/e2e/*.spec.js` file, or create a new file for a new feature area

### Updating Test Messages

When HL7 message structures change:
1. Update the sample messages in `tests/e2e/helpers.js`
2. Update golden test files in `test/golden/` if applicable
3. Run `npm run test:all` to verify all tests pass

### Flaky Test Prevention

- Use explicit waits (`waitForSelector`) instead of fixed timeouts
- Set reasonable timeouts (30s default, 10s for expect)
- Run tests sequentially (`workers: 1`) to avoid resource contention
- Enable retries (`retries: 1`) for transient failures

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Electron launch timing | Explicit waits for window readiness and UI elements |
| File dialog handling | Playwright's dialog interception for save/open operations |
| Clipboard access | Tests verify clipboard state via Electron APIs |
| Cross-platform paths | All file paths use `path.join()` for portability |
| Flaky selectors | Use stable IDs and data attributes, avoid CSS class selectors |

## Test Counts

| Category | Count |
|----------|-------|
| Unit Tests | 121 |
| E2E Tests | 50+ |
| **Total** | **171+** |
