// Shared test helpers for HL7Tool E2E tests
// All locators use data-testid attributes for reliability after the MsgLab redesign.

/* global detachFile -- a function of renderer.js, called inside the page */

const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * Valid HL7 ADT^A01 message for testing
 */
const HL7_MESSAGES = {
  ADT_A01: [
    String.raw`MSH|^~\&|HIS|MAINHOSP|EHR|MAINHOSP|20261024120000||ADT^A01|MSG0001|T|2.5.1`,
    'EVN|A01|20261024120000',
    'PID|1||12345^^^HOSP^MR||DOE^JOHN^A||19800412|M|||123 MAIN ST^^ANYTOWN|NY|12345',
    'PV1|1|I|20A^20B^20C^^WING A|||1000^SMITH^JOHN^DR.|||SUR|123456^DISCHARGE||A',
  ].join('\r'),

  ADT_A02: [
    String.raw`MSH|^~\&|HIS|MAINHOSP|EHR|MAINHOSP|20261024120000||ADT^A02|MSG0002|T|2.5.1`,
    'EVN|A02|20261024120000',
    'PID|1||12345^^^HOSP^MR||DOE^JOHN^A||19800412|M|||123 MAIN ST^^ANYTOWN|NY|12345',
    'PV1|1|I|20A^20B^20C^^WING A|||1000^SMITH^JOHN^DR.|||SUR|123456^DISCHARGE||A',
  ].join('\r'),

  ORU_R01: [
    String.raw`MSH|^~\&|LAB|LABHOSP|EHR|MAINHOSP|20261024120000||ORU^R01|MSG0003|T|2.5.1`,
    'PID|1||12345^^^HOSP^MR||DOE^JOHN^A||19800412|M',
    'OBR|1|ORD123|LAB123^LAB|CBC^^^LAB||20261024120000',
    'OBX|1|ST|WBC^^^LAB|Normal|||N|N||F|20261024120000',
  ].join('\r'),

  ORM_O01: [
    String.raw`MSH|^~\&|HIS|MAINHOSP|LAB|LABHOSP|20261024120000||ORM^O01|MSG0004|T|2.5.1`,
    'PID|1||12345^^^HOSP^MR||DOE^JOHN^A||19800412|M',
    'ORC|RE|ORD123|LAB123^LAB|20261024120000',
    'OBR|1|ORD123|LAB123^LAB|CBC^^^LAB|20261024120000',
  ].join('\r'),

  INVALID: 'This is not a valid HL7 message',
  MALFORMED: 'MSH|^~\\&|SENDER|FACILITY|RECEIVER|FACILITY|20261024120000||ADT^A01|MSG0001|T|2.5.1\rPID|1||12345',
  EMPTY: '',
  WHITESPACE: '   \r\n  ',
};

/**
 * Shortcut: create a locator by data-testid.
 * (The types are written out so that editors know this is a Playwright Locator, and so find toBeVisible() and the other checks.)
 * @param {import('@playwright/test').Page} window
 * @param {string} id
 * @returns {import('@playwright/test').Locator}
 */
function tid(window, id) {
  return window.locator(`[data-testid="${id}"]`);
}

/**
 * Wait for the Electron app window to be ready
 */
async function waitForWindow(electronApp, timeout = 30000) {
  const window = await electronApp.firstWindow({ timeout });
  // Wait for the message textarea via data-testid, indicating the UI is loaded
  await window.waitForSelector('[data-testid="message"]', { state: 'visible', timeout: 10000 });
  return window;
}

/**
 * Start the app with its own, empty data folder, so a test never reads or changes the
 * real settings of the person running it. Pass { userDataDir } to start again on the
 * data of an earlier run (for example to test what is remembered between runs).
 */
async function launchApp({ userDataDir } = {}) {
  const dir = userDataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'msglab-e2e-'));
  const electronApp = await electron.launch({ args: [`--user-data-dir=${dir}`, '.'] });
  electronApp.userDataDir = dir;
  return electronApp;
}

/**
 * Close the Electron app and delete its data folder (unless keepData is set, for a restart).
 */
async function closeApp(electronApp, { keepData = false } = {}) {
  const child = electronApp.process();
  try {
    // destroy() closes a window without the "unsaved changes" question, which would otherwise
    // block the quit (and the whole app) for as long as nobody answers it
    await electronApp.evaluate(({ app, BrowserWindow }) => {
      for (const win of BrowserWindow.getAllWindows()) win.destroy();
      app.quit();
    });
  } catch {
    // App may already be closed
  }
  const running = () => child.exitCode === null;
  if (running()) {
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    // A window that still does not answer is stopped for good (SIGKILL cannot be ignored)
    if (running()) child.kill('SIGKILL');
  }
  if (!keepData && electronApp.userDataDir) fs.rmSync(electronApp.userDataDir, { recursive: true, force: true });
}

/**
 * Replace the native dialogs and the "open a web address" call of the main process with
 * stand-ins, so tests can answer them. Answers are queued with queueDialog(); a dialog
 * with no queued answer is cancelled (message boxes answer 1, the "Cancel" button).
 */
async function stubDialogs(electronApp) {
  await electronApp.evaluate(({ dialog, shell }) => {
    const state = { queues: { save: [], open: [], box: [] }, calls: [], external: [] };
    globalThis.e2eDialogs = state;
    const next = (kind, fallback) => (state.queues[kind].length > 0 ? state.queues[kind].shift() : fallback);
    dialog.showSaveDialog = async (...args) => {
      state.calls.push({ kind: 'save', options: args.at(-1) });
      const answer = next('save', { canceled: true });
      return answer.canceled ? { canceled: true } : { canceled: false, filePath: answer.path };
    };
    dialog.showOpenDialog = async (...args) => {
      state.calls.push({ kind: 'open', options: args.at(-1) });
      const answer = next('open', { canceled: true });
      return answer.canceled ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: answer.paths };
    };
    dialog.showMessageBox = async (...args) => {
      state.calls.push({ kind: 'box', options: args.at(-1) });
      return { response: next('box', 1), checkboxChecked: false };
    };
    dialog.showMessageBoxSync = (...args) => {
      state.calls.push({ kind: 'box', options: args.at(-1) });
      return next('box', 1);
    };
    shell.openExternal = async (url) => {
      state.external.push(url);
    };
  });
}

/**
 * Queue the answer to the next dialog of a kind:
 *   'save': { path } or { canceled: true }
 *   'open': { paths: [...] } or { canceled: true }
 *   'box':  the number of the button to press (0 is the first button)
 */
async function queueDialog(electronApp, kind, answer) {
  await electronApp.evaluate((_electron, [which, value]) => {
    globalThis.e2eDialogs.queues[which].push(value);
  }, [kind, answer]);
}

/** The dialogs shown so far ('save', 'open' or 'box'), each with its options. */
async function getDialogCalls(electronApp, kind) {
  return electronApp.evaluate((_electron, which) => globalThis.e2eDialogs.calls.filter((call) => call.kind === which), kind);
}

/** The web addresses the app asked to open. */
async function getOpenedAddresses(electronApp) {
  return electronApp.evaluate(() => [...globalThis.e2eDialogs.external]);
}

/** Send a File menu command (new, open, save, saveAs, export) as if it was chosen in the menu. */
async function sendMenuCommand(electronApp, command) {
  await electronApp.evaluate(({ BrowserWindow }, name) => {
    BrowserWindow.getAllWindows()[0].webContents.send('menu:command', name);
  }, command);
}

/** A new empty folder in the system's temporary folder; delete it with removeTempDir(). */
function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'msglab-files-'));
}

function removeTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Wait until a file exists and has been written completely: it is not empty and its size is
 * the same at two checks in a row (a file is created before its bytes are written).
 */
async function waitUntilWritten(file, timeout) {
  let previous = -1;
  await expect.poll(() => {
    const size = fs.existsSync(file) ? fs.statSync(file).size : -1;
    const settled = size > 0 && size === previous;
    previous = size;
    return settled;
  }, { timeout, intervals: [100], message: `The file ${file} was not written` }).toBe(true);
}

/** Wait until a file is written and return its bytes. */
async function waitForFile(file, timeout = 10000) {
  await waitUntilWritten(file, timeout);
  return fs.readFileSync(file);
}

/** Wait until a file is written and return its text (UTF-8). */
async function waitForFileText(file, timeout = 10000) {
  await waitUntilWritten(file, timeout);
  return fs.readFileSync(file, 'utf8');
}

/**
 * Clear the unsaved-changes (dirty) flag in the renderer so the native
 * "Unsaved changes" confirmation dialog does not appear during tests.
 * This prevents test timeouts caused by the blocking Electron dialog.
 */
async function clearDirtyState(window) {
  await window.evaluate(() => {
    // detachFile() is the renderer's own reset: it empties the file name, clears the changed flag
    // and tells the main process that the window is no longer dirty
    detachFile();
  });
  await window.waitForTimeout(100);
}

/**
 * Paste an HL7 message into the message textarea.
 * Automatically clears the dirty state so the unsaved-changes dialog
 * does not block subsequent test actions.
 */
async function pasteMessage(window, message) {
  await goTo(window, 'editor');
  await tid(window, 'message').click();
  await tid(window, 'message').fill(message);
  // Trigger input event for auto-validation
  await window.evaluate(() => {
    document.getElementById('message').dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Wait for validation to complete
  await window.waitForTimeout(500);
  // Clear dirty state to prevent the unsaved-changes modal from blocking tests
  await clearDirtyState(window);
}

/**
 * Go to a view of the sidebar: editor, generate, bulk or settings
 */
async function goTo(window, view) {
  await window.click(`#nav-${view}`);
  await window.waitForTimeout(100);
}

/**
 * Click a tab button (Validation or Explain)
 */
async function clickTab(window, tabName) {
  await goTo(window, 'editor');
  await tid(window, `tab-${tabName}`).click();
  await window.waitForTimeout(200);
}

/**
 * Get validation results text
 */
async function getValidationResults(window) {
  return tid(window, 'panel-validation').textContent();
}

/**
 * Get explanation results text
 */
async function getExplanationResults(window) {
  return tid(window, 'panel-explain').textContent();
}

/**
 * Get the validation badge text ("Valid" or "Not valid")
 */
async function getValidationBadge(window) {
  return tid(window, 'validation-badge').textContent();
}

/**
 * Get the validation summary text (message type, error/warning counts)
 */
async function getValidationSummary(window) {
  return tid(window, 'validation-summary-text').textContent();
}

/**
 * Count validation issues, optionally filtered by severity ("error", "warning", "info").
 * Only counts top-level issue containers (<li> elements), not their child elements.
 */
async function getValidationIssueCount(window, severity) {
  // Use li[data-testid^="validation-issue-"] to match only the issue containers,
  // not their children like validation-issue-1-severity, validation-issue-1-message, etc.
  const issues = await window.locator('li[data-testid^="validation-issue-"]').all();
  if (severity) {
    const sevTexts = await Promise.all(
      issues.map(issue => issue.locator(`[data-testid$="-severity"]`).textContent()),
    );
    return sevTexts.filter(
      text => text.trim().toLowerCase() === severity.toLowerCase(),
    ).length;
  }
  return issues.length;
}

/**
 * Get the message of a specific validation issue (1-based index)
 */
async function getValidationIssueMessage(window, index) {
  return tid(window, `validation-issue-${index}-message`).textContent();
}

/**
 * Get the severity of a specific validation issue (1-based index)
 */
async function getValidationIssueSeverity(window, index) {
  return tid(window, `validation-issue-${index}-severity`).textContent();
}

/**
 * Count explanation segments (dynamic test IDs: explain-segment-1, explain-segment-2, ...).
 * Only counts top-level segment containers, not their child elements.
 */
async function getExplanationSegmentCount(window) {
  return window.locator('div[data-testid^="explain-segment-"]').count();
}

/**
 * Get the name of an explanation segment (1-based index)
 */
async function getExplanationSegmentName(window, index) {
  return tid(window, `explain-segment-${index}-name`).textContent();
}

/**
 * Get the description of an explanation segment (1-based index)
 */
async function getExplanationSegmentDesc(window, index) {
  return tid(window, `explain-segment-${index}-desc`).textContent();
}

/**
 * Count bulk result rows (dynamic test IDs: bulk-row-1, bulk-row-2, ...).
 * Only counts the <tr> row elements, not their child cells.
 */
async function getBulkRowCount(window) {
  return window.locator('tr[data-testid^="bulk-row-"]').count();
}

/**
 * Get the type column of a bulk row (1-based index)
 */
async function getBulkRowType(window, index) {
  return tid(window, `bulk-row-${index}-type`).textContent();
}

/**
 * Get the patient column of a bulk row (1-based index)
 */
async function getBulkRowPatient(window, index) {
  return tid(window, `bulk-row-${index}-patient`).textContent();
}

/**
 * Get the time column of a bulk row (1-based index)
 */
async function getBulkRowTime(window, index) {
  return tid(window, `bulk-row-${index}-time`).textContent();
}

/**
 * Get the control ID column of a bulk row (1-based index)
 */
async function getBulkRowControlId(window, index) {
  return tid(window, `bulk-row-${index}-control-id`).textContent();
}

/**
 * Get the generated message from the textarea
 */
async function getMessageText(window) {
  return window.evaluate(() => document.getElementById('message').value);
}

/**
 * Generate a message with the given settings
 */
async function generateMessage(window, options = {}) {
  const {
    messageType = 'ADT^A01',
    version = '2.5.1',
    sendingApp = 'HIS',
    sendingFac = 'SENDHOSP',
    receivingApp = 'EHR',
    receivingFac = 'GETHOSP',
    processing = 'T',
  } = options;

  await goTo(window, 'generate');
  // Set message type
  await tid(window, 'gen-type').selectOption(messageType);
  // Set version
  await tid(window, 'gen-version').selectOption(version);
  // Set sending application
  if (sendingApp) {
    await tid(window, 'gen-send-app').fill(sendingApp);
  }
  // Set sending facility
  if (sendingFac) {
    await tid(window, 'gen-send-fac').fill(sendingFac);
  }
  // Set receiving application
  if (receivingApp) {
    await tid(window, 'gen-recv-app').fill(receivingApp);
  }
  // Set receiving facility
  if (receivingFac) {
    await tid(window, 'gen-recv-fac').fill(receivingFac);
  }
  // Set processing id
  await tid(window, 'gen-processing').selectOption(processing);

  // Click Generate button
  await tid(window, 'gen-submit').click();
  await window.waitForTimeout(500);
  // Clear dirty state to prevent the unsaved-changes modal from blocking tests
  await clearDirtyState(window);
}

/**
 * Set file options
 */
async function setFileOptions(window, options = {}) {
  const { eol = 'cr', encoding = 'utf-8', mllp = false } = options;
  await goTo(window, 'settings');
  if (eol) {
    await tid(window, 'file-eol').selectOption(eol);
  }
  if (encoding) {
    await tid(window, 'file-encoding').selectOption(encoding);
  }
  if (mllp) {
    await tid(window, 'file-mllp').check();
  } else {
    await tid(window, 'file-mllp').uncheck();
  }
}

/**
 * Configure bulk generation settings
 */
async function configureBulkGeneration(window, options = {}) {
  const { count = 10, minutes = 5, mode = 'independent' } = options;

  await goTo(window, 'bulk');

  // Set count
  await tid(window, 'bulk-count').fill(String(count));
  // Set minutes between messages
  await tid(window, 'bulk-minutes').fill(String(minutes));
  // Set patient mode
  await tid(window, 'bulk-mode').selectOption(mode);
}

/**
 * Get the app title text
 */
async function getAppTitle(window) {
  return tid(window, 'app-title').textContent();
}

/**
 * Check if the Send nav button is disabled
 */
async function isSendDisabled(window) {
  return tid(window, 'nav-send').isEnabled().then((enabled) => !enabled);
}

/**
 * Get the message stats text (segment count, character count)
 */
async function getMessageStats(window) {
  return tid(window, 'message-stats').textContent();
}

/**
 * Get the file status text
 */
async function getFileStatus(window) {
  return tid(window, 'file-status').textContent();
}

/**
 * Get the generation status text
 */
async function getGenStatus(window) {
  return tid(window, 'gen-status').textContent();
}

/**
 * Get the bulk status text
 */
async function getBulkStatus(window) {
  return tid(window, 'bulk-status').textContent();
}

/**
 * Get the bulk summary text
 */
async function getBulkSummary(window) {
  return tid(window, 'bulk-summary').textContent();
}

/**
 * Get the bulk copy status text
 */
async function getBulkCopyStatus(window) {
  return tid(window, 'bulk-copy-status').textContent();
}

/**
 * Get the export status text
 */
async function getExportStatus(window) {
  return tid(window, 'export-status').textContent();
}

/**
 * Get the folder status text
 */
async function getFolderStatus(window) {
  return tid(window, 'folder-status').textContent();
}

/**
 * Set the theme (system, light, dark)
 */
async function setTheme(window, theme) {
  await goTo(window, 'settings');
  await tid(window, 'app-theme').selectOption(theme);
}

/**
 * Get the current theme value
 */
async function getTheme(window) {
  return tid(window, 'app-theme').inputValue();
}

/**
 * Click the favorite star button in the generator
 */
async function clickFavorite(window) {
  await tid(window, 'gen-fav').click();
  await window.waitForTimeout(200);
}

/**
 * Check if the favorite star is filled (favorited)
 */
async function isFavorited(window) {
  const text = await tid(window, 'gen-fav').textContent();
  return text.includes('★');
}

/**
 * Open the About dialog by clicking the app logo
 */
async function openAboutByLogo(window) {
  await tid(window, 'app-logo').click();
  await window.waitForSelector('[data-testid="about"]', { state: 'visible', timeout: 5000 });
}

async function openAbout(window, electronApp) {
  await sendMenuCommand(electronApp, 'about');
  await window.waitForSelector('[data-testid="about"]', { state: 'visible', timeout: 5000 });
}

/**
 * Close the About dialog
 */
async function closeAbout(window) {
  await tid(window, 'about-close').click();
  await window.waitForTimeout(300);
}

/**
 * Get the About dialog name
 */
async function getAboutName(window) {
  return tid(window, 'about-name').textContent();
}

/**
 * Get the About dialog version
 */
async function getAboutVersion(window) {
  return tid(window, 'about-version').textContent();
}

/**
 * Get the About dialog license
 */
async function getAboutLicense(window) {
  return tid(window, 'about-license').textContent();
}

/**
 * Get the About dialog owner
 */
async function getAboutOwner(window) {
  return tid(window, 'about-owner').textContent();
}

/**
 * Generate bulk messages
 */
async function generateBulk(window) {
  await tid(window, 'bulk-generate').click();
  await window.waitForTimeout(1000);
}

/**
 * Copy all bulk messages to clipboard
 */
async function copyBulkAll(window) {
  await tid(window, 'bulk-copy').click();
  await window.waitForTimeout(500);
}

/**
 * Select all bulk message types
 */
async function selectAllBulkTypes(window) {
  await tid(window, 'bulk-types-all').click();
  await window.waitForTimeout(200);
}

/**
 * Select no bulk message types
 */
async function selectNoBulkTypes(window) {
  await tid(window, 'bulk-types-none').click();
  await window.waitForTimeout(200);
}

/**
 * Select only favorite bulk message types
 */
async function selectFavBulkTypes(window) {
  await tid(window, 'bulk-types-favs').click();
  await window.waitForTimeout(200);
}

/**
 * Set export mode (one, each, type)
 */
async function setExportMode(window, mode) {
  await tid(window, 'export-mode').selectOption(mode);
  await window.waitForTimeout(200);
}

/**
 * Toggle the batch header checkbox
 */
async function setExportBatch(window, checked) {
  if (checked) {
    await tid(window, 'export-batch').check();
  } else {
    await tid(window, 'export-batch').uncheck();
  }
  await window.waitForTimeout(200);
}

/**
 * Click the export button
 */
async function clickExport(window) {
  await tid(window, 'export-run').click();
  await window.waitForTimeout(500);
}

/**
 * Get the value of a manual field by key
 */
async function getManualFieldValue(window, key) {
  return tid(window, `manual-${key}-value`).inputValue();
}

/**
 * Set a manual field value by key
 */
async function setManualFieldValue(window, key, value) {
  await tid(window, `manual-${key}-value`).fill(value);
  await window.waitForTimeout(100);
}

/**
 * Check the empty checkbox for a manual field
 */
async function setManualFieldEmpty(window, key) {
  await tid(window, `manual-${key}-empty`).check();
  await window.waitForTimeout(100);
}

/**
 * Click the clear manual values button
 */
async function clearManualValues(window) {
  await tid(window, 'manual-clear').click();
  await window.waitForTimeout(200);
}

/**
 * Get the placeholder text for a panel
 */
async function getPlaceholder(window, panelName) {
  return tid(window, `${panelName}-placeholder`).textContent();
}

/**
 * Take a screenshot of the Electron window and attach it to the current test.
 * Use in an afterEach hook so failures are captured in the report.
 * Example:
 *   test.afterEach(async ({}, testInfo) => {
 *     if (testInfo.status !== testInfo.expectedStatus) {
 *       await takeScreenshotOnFailure(window, testInfo);
 *     }
 *   });
 */
async function takeScreenshotOnFailure(window, testInfo) {
  try {
    const screenshot = await window.screenshot({ type: 'png' });
    testInfo.attach('failure-screenshot.png', {
      body: screenshot,
      contentType: 'image/png',
    });
  } catch {
    // Screenshot may fail if the window is already closed
  }
}

/* ---- Send helpers ---- */

/**
 * Set the server host in the Send view
 */
async function setSendHost(window, host) {
  await tid(window, 'send-host').fill(host);
  await window.waitForTimeout(100);
}

/**
 * Set the server port in the Send view
 */
async function setSendPort(window, port) {
  await tid(window, 'send-port').fill(String(port));
  await window.waitForTimeout(100);
}

/**
 * Set the connect timeout in the Send view
 */
async function setSendConnectTimeout(window, seconds) {
  await tid(window, 'send-connect-timeout').fill(String(seconds));
  await window.waitForTimeout(100);
}

/**
 * Set the ACK reply timeout in the Send view
 */
async function setSendReplyTimeout(window, seconds) {
  await tid(window, 'send-reply-timeout').fill(String(seconds));
  await window.waitForTimeout(100);
}

/**
 * Set the encoding in the Send view (utf-8 or windows-1252)
 */
async function setSendEncoding(window, encoding) {
  await tid(window, 'send-encoding').selectOption(encoding);
  await window.waitForTimeout(100);
}

/**
 * Click the Test connection button
 */
async function clickSendTest(window) {
  await tid(window, 'send-test').click();
}

/**
 * Click the Send button
 */
async function clickSendGo(window) {
  await tid(window, 'send-go').click();
}

/**
 * Check the "Also send the message from the editor" checkbox on Test connection
 */
async function setSendTestMessage(window, checked) {
  if (checked) {
    await tid(window, 'send-test-message').check();
  } else {
    await tid(window, 'send-test-message').uncheck();
  }
  await window.waitForTimeout(100);
}

/**
 * Get the Send status text (after clicking Send)
 */
async function getSendStatus(window) {
  return tid(window, 'send-status').textContent();
}

/**
 * Get the Test connection status text
 */
async function getSendTestStatus(window) {
  return tid(window, 'send-test-status').textContent();
}

/**
 * Get the message summary text in the Send view
 */
async function getSendSummary(window) {
  return tid(window, 'send-message-summary').textContent();
}

/**
 * Check if the Send result section is visible
 */
async function isSendResultVisible(window) {
  return tid(window, 'send-result').isVisible();
}

/**
 * Get the ACK text from the result details
 */
async function getSendAckText(window) {
  return tid(window, 'send-ack-text').textContent();
}

/**
 * Check if the ACK details section is visible
 */
async function isSendAckVisible(window) {
  return !tid(window, 'send-ack-details').isHidden();
}

/**
 * Check if the raw reply details section is visible
 */
async function isSendRawVisible(window) {
  return !tid(window, 'send-raw-details').isHidden();
}

/**
 * Get the raw reply visible text
 */
async function getSendRawVisible(window) {
  return tid(window, 'send-raw-visible').textContent();
}

/**
 * Get the raw reply hex dump
 */
async function getSendRawHex(window) {
  return tid(window, 'send-raw-hex').textContent();
}

/**
 * Get the number of warning items in the send result
 */
async function getSendWarningCount(window) {
  const locator = window.locator('li[data-testid^="send-warning-"]');
  return locator.count();
}

/**
 * Get the text of a specific warning (1-indexed)
 */
async function getSendWarningText(window, index) {
  return tid(window, `send-warning-${index}`).textContent();
}

/**
 * Check if the Send button is disabled
 */
async function isSendGoDisabled(window) {
  return tid(window, 'send-go').isDisabled();
}

/**
 * Check if the Test connection button is disabled
 */
async function isSendTestDisabled(window) {
  return tid(window, 'send-test').isDisabled();
}

/**
 * Check if the Cancel button is visible (during sending)
 */
async function isSendCancelVisible(window) {
  return !tid(window, 'send-cancel').isHidden();
}

/**
 * Set a connection profile name
 */
async function setProfileName(window, name) {
  await tid(window, 'send-profile-name').fill(name);
  await window.waitForTimeout(100);
}

/**
 * Click the Save profile button
 */
async function clickProfileSave(window) {
  await tid(window, 'send-profile-save').click();
  await window.waitForTimeout(300);
}

/**
 * Click the Delete profile button
 */
async function clickProfileDelete(window) {
  await tid(window, 'send-profile-delete').click();
  await window.waitForTimeout(300);
}

/**
 * Get the profile status text
 */
async function getProfileStatus(window) {
  return tid(window, 'send-profile-status').textContent();
}

/**
 * Get the selected profile name from the dropdown
 */
async function getSelectedProfile(window) {
  return tid(window, 'send-profile').inputValue();
}

/**
 * Select a profile from the dropdown
 */
async function selectProfile(window, name) {
  await tid(window, 'send-profile').selectOption(name);
  await window.waitForTimeout(300);
}

/**
 * Get the send status element CSS class (ok/error)
 */
async function getSendStatusClass(window) {
  return tid(window, 'send-status').getAttribute('class');
}

/**
 * Get the test status element CSS class (ok/error)
 */
async function getSendTestStatusClass(window) {
  return tid(window, 'send-test-status').getAttribute('class');
}

module.exports = {
  HL7_MESSAGES,
  waitForWindow,
  closeApp,
  clearDirtyState,
  pasteMessage,
  clickTab,
  goTo,
  getValidationResults,
  getValidationBadge,
  getValidationSummary,
  getValidationIssueCount,
  getValidationIssueMessage,
  getValidationIssueSeverity,
  getExplanationResults,
  getExplanationSegmentCount,
  getExplanationSegmentName,
  getExplanationSegmentDesc,
  getMessageText,
  generateMessage,
  setFileOptions,
  configureBulkGeneration,
  getBulkRowCount,
  getBulkRowType,
  getBulkRowPatient,
  getBulkRowTime,
  getBulkRowControlId,
  getAppTitle,
  isSendDisabled,
  getMessageStats,
  getFileStatus,
  getGenStatus,
  getBulkStatus,
  getBulkSummary,
  getBulkCopyStatus,
  getExportStatus,
  getFolderStatus,
  setTheme,
  getTheme,
  clickFavorite,
  isFavorited,
  openAbout,
  closeAbout,
  getAboutName,
  getAboutVersion,
  getAboutLicense,
  getAboutOwner,
  generateBulk,
  copyBulkAll,
  selectAllBulkTypes,
  selectNoBulkTypes,
  selectFavBulkTypes,
  setExportMode,
  setExportBatch,
  clickExport,
  getManualFieldValue,
  setManualFieldValue,
  setManualFieldEmpty,
  clearManualValues,
  getPlaceholder,
  tid,
  launchApp,
  stubDialogs,
  queueDialog,
  getDialogCalls,
  getOpenedAddresses,
  sendMenuCommand,
  openAboutByLogo,
  makeTempDir,
  removeTempDir,
  waitForFile,
  waitForFileText,
  takeScreenshotOnFailure,
  // Send helpers
  setSendHost,
  setSendPort,
  setSendConnectTimeout,
  setSendReplyTimeout,
  setSendEncoding,
  clickSendTest,
  clickSendGo,
  setSendTestMessage,
  getSendStatus,
  getSendTestStatus,
  getSendSummary,
  isSendResultVisible,
  getSendAckText,
  isSendAckVisible,
  isSendRawVisible,
  getSendRawVisible,
  getSendRawHex,
  getSendWarningCount,
  getSendWarningText,
  isSendGoDisabled,
  isSendTestDisabled,
  isSendCancelVisible,
  setProfileName,
  clickProfileSave,
  clickProfileDelete,
  getProfileStatus,
  getSelectedProfile,
  selectProfile,
  getSendStatusClass,
  getSendTestStatusClass,
};
