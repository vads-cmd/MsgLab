// Shared test helpers for HL7Tool E2E tests

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
    'OBX|1|NM|WBC^^^LAB|7.5|10*3/uL|5-10|N|N|20261024120000',
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
 * Wait for the Electron app window to be ready
 */
async function waitForWindow(electronApp, timeout = 10000) {
  const window = await electronApp.firstWindow({ timeout });
  // Wait for the textarea to be present, indicating the UI is loaded
  await window.waitForSelector('#message', { state: 'visible', timeout: 10000 });
  return window;
}

/**
 * Close the Electron app forcefully
 */
async function closeApp(electronApp) {
  try {
    await electronApp.evaluate(async ({ app }) => {
      app.quit();
    });
  } catch (e) {
    // App may already be closed
  }
}

/**
 * Paste an HL7 message into the message textarea
 */
async function pasteMessage(window, message) {
  await window.click('#message');
  await window.fill('#message', message);
  // Trigger input event for auto-validation
  await window.evaluate(() => {
    document.getElementById('message').dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Wait for validation to complete
  await window.waitForTimeout(500);
}

/**
 * Click a tab button (Validation or Explain)
 */
async function clickTab(window, tabName) {
  const selector = `[data-tab="${tabName}"]`;
  await window.click(selector);
  await window.waitForTimeout(200);
}

/**
 * Get validation results text
 */
async function getValidationResults(window) {
  return window.locator('#panel-validation').textContent();
}

/**
 * Get explanation results text
 */
async function getExplanationResults(window) {
  return window.locator('#panel-explain').textContent();
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
    sendingFac = 'MAINHOSP',
    receivingApp = 'EHR',
    receivingFac = 'MAINHOSP',
    processing = 'T',
  } = options;

  // Set message type
  await window.selectOption('#gen-type', messageType);
  // Set version
  await window.selectOption('#gen-version', version);
  // Set sending application
  if (sendingApp) {
    await window.fill('#gen-send-app', sendingApp);
  }
  // Set sending facility
  if (sendingFac) {
    await window.fill('#gen-send-fac', sendingFac);
  }
  // Set receiving application
  if (receivingApp) {
    await window.fill('#gen-recv-app', receivingApp);
  }
  // Set receiving facility
  if (receivingFac) {
    await window.fill('#gen-recv-fac', receivingFac);
  }
  // Set processing id
  await window.selectOption('#gen-processing', processing);

  // Click Generate button
  await window.click('#generator button[type="submit"]');
  await window.waitForTimeout(500);
}

/**
 * Set file options
 */
async function setFileOptions(window, options = {}) {
  const { eol = 'cr', encoding = 'utf-8', mllp = false } = options;
  if (eol) {
    await window.selectOption('#file-eol', eol);
  }
  if (encoding) {
    await window.selectOption('#file-encoding', encoding);
  }
  if (mllp) {
    await window.check('#file-mllp');
  } else {
    await window.uncheck('#file-mllp');
  }
}

/**
 * Configure bulk generation settings
 */
async function configureBulkGeneration(window, options = {}) {
  const { count = 10, minutes = 5, mode = 'independent' } = options;

  // Open bulk generation panel if closed
  const bulkSummary = await window.locator('#bulk').getAttribute('open');
  if (!bulkSummary) {
    await window.click('#bulk > summary');
    await window.waitForTimeout(200);
  }

  // Set count
  await window.fill('#bulk-count', String(count));
  // Set minutes between messages
  await window.fill('#bulk-minutes', String(minutes));
  // Set patient mode
  await window.selectOption('#bulk-mode', mode);
}

module.exports = {
  HL7_MESSAGES,
  waitForWindow,
  closeApp,
  pasteMessage,
  clickTab,
  getValidationResults,
  getExplanationResults,
  getMessageText,
  generateMessage,
  setFileOptions,
  configureBulkGeneration,
};
