'use strict';

/**
 * HL7 code tables, used to show what a coded value means (for example sex "M" = Male).
 * Only the tables that the dictionary refers to are included.
 */
const TABLES = {
  '0001': { name: 'Administrative Sex', codes: { F: 'Female', M: 'Male', O: 'Other', U: 'Unknown', A: 'Ambiguous', N: 'Not applicable' } },
  '0002': {
    name: 'Marital Status',
    codes: {
      A: 'Separated', B: 'Unmarried', C: 'Common law', D: 'Divorced', E: 'Legally separated', G: 'Living together', I: 'Interlocutory',
      M: 'Married', N: 'Annulled', O: 'Other', P: 'Domestic partner', R: 'Registered domestic partner', S: 'Single', T: 'Unreported',
      U: 'Unknown', W: 'Widowed',
    },
  },
  '0003': {
    name: 'Event Type Code',
    codes: {
      A01: 'Admit/visit notification', A02: 'Transfer a patient', A03: 'Discharge/end visit', A04: 'Register a patient', A05: 'Pre-admit a patient',
      A06: 'Change an outpatient to an inpatient', A07: 'Change an inpatient to an outpatient', A08: 'Update patient information',
      A11: 'Cancel admit/visit notification', A18: 'Merge patient information', A12: 'Cancel transfer', A13: 'Cancel discharge/end visit', A28: 'Add person information',
      A31: 'Update person information', A40: 'Merge patient - patient identifier list', A60: 'Update allergy information', O01: 'Order message', O21: 'Laboratory order',
      R01: 'Unsolicited transmission of requested observation', S12: 'Notification of new appointment booking', T02: 'Original document notification and content',
      V04: 'Unsolicited vaccination record update',
    },
  },
  '0004': {
    name: 'Patient Class',
    codes: { B: 'Obstetrics', C: 'Commercial Account', E: 'Emergency', I: 'Inpatient', N: 'Not Applicable', O: 'Outpatient', P: 'Preadmit', R: 'Recurring patient', U: 'Unknown' },
  },
  '0005': {
    name: 'Race',
    codes: {
      '1002-5': 'American Indian or Alaska Native', '2028-9': 'Asian', '2054-5': 'Black or African American',
      '2076-8': 'Native Hawaiian or Other Pacific Islander', '2106-3': 'White', '2131-1': 'Other Race',
    },
  },
  '0007': { name: 'Admission Type', codes: { A: 'Accident', C: 'Elective', E: 'Emergency', L: 'Labor and Delivery', N: 'Newborn', R: 'Routine', U: 'Urgent' } },
  '0008': {
    name: 'Acknowledgment Code',
    codes: { AA: 'Application Accept', AE: 'Application Error', AR: 'Application Reject', CA: 'Commit Accept', CE: 'Commit Error', CR: 'Commit Reject' },
  },
  '0038': {
    name: 'Order Status',
    codes: {
      A: 'Some, but not all, results available', CA: 'Order was canceled', CM: 'Order is completed', DC: 'Order was discontinued',
      ER: 'Error, order not found', HD: 'Order is on hold', IP: 'In process, unspecified', RP: 'Order has been replaced', SC: 'In process, scheduled',
    },
  },
  '0052': { name: 'Diagnosis Type', codes: { A: 'Admitting', F: 'Final', W: 'Working' } },
  '0063': {
    name: 'Relationship',
    codes: {
      BRO: 'Brother', CGV: 'Caregiver', CHD: 'Child', DOM: 'Life partner', EMC: 'Emergency contact', FND: 'Friend', FTH: 'Father', GRD: 'Guardian',
      MTH: 'Mother', NON: 'None', OTH: 'Other', PAR: 'Parent', SEL: 'Self', SIB: 'Sibling', SIS: 'Sister', SPO: 'Spouse', UNK: 'Unknown',
    },
  },
  '0065': {
    name: 'Specimen Action Code',
    codes: { A: 'Add ordered tests to the existing specimen', G: 'Generated order', L: 'Lab to obtain specimen from patient', O: 'Specimen obtained by service other than Lab', P: 'Pending specimen', R: 'Revised order', S: 'Schedule the tests specified below' },
  },
  '0076': {
    name: 'Message Type',
    codes: {
      ACK: 'General acknowledgment', ADT: 'Admit, discharge, transfer', BAR: 'Add/change billing account', DFT: 'Detail financial transaction',
      MDM: 'Medical document management', OML: 'Laboratory order', ORM: 'Order message', ORR: 'Order response', ORU: 'Observation result',
      OUL: 'Unsolicited laboratory observation', QBP: 'Query by parameter', QRY: 'Query, original mode', RDE: 'Pharmacy encoded order',
      REF: 'Patient referral', RSP: 'Segment pattern response', SIU: 'Schedule information unsolicited', VXU: 'Vaccination record update',
    },
  },
  '0078': {
    name: 'Abnormal Flags',
    codes: {
      '<': 'Below absolute low-off instrument scale', '>': 'Above absolute high-off instrument scale', A: 'Abnormal', AA: 'Very abnormal',
      B: 'Better', D: 'Significant change down', H: 'High', HH: 'Critical high', I: 'Intermediate', L: 'Low', LL: 'Critical low',
      MS: 'Moderately susceptible', N: 'Normal', R: 'Resistant', S: 'Susceptible', U: 'Significant change up', VS: 'Very susceptible', W: 'Worse',
    },
  },
  '0085': {
    name: 'Observation Result Status',
    codes: {
      C: 'Record coming over is a correction', D: 'Deletes the OBX record', F: 'Final results', I: 'Specimen in lab; results pending', N: 'Not asked',
      O: 'Order detail description only', P: 'Preliminary results', R: 'Results entered - not verified', S: 'Partial results',
      U: 'Results status change to final', W: 'Post original as wrong', X: 'Results cannot be obtained',
    },
  },
  '0103': { name: 'Processing ID', codes: { D: 'Debugging', P: 'Production', T: 'Training' } },
  '0104': {
    name: 'Version ID',
    codes: {
      '2.1': 'Release 2.1', '2.2': 'Release 2.2', '2.3': 'Release 2.3', '2.3.1': 'Release 2.3.1', '2.4': 'Release 2.4', '2.5': 'Release 2.5',
      '2.5.1': 'Release 2.5.1', '2.6': 'Release 2.6', '2.7': 'Release 2.7', '2.7.1': 'Release 2.7.1', '2.8': 'Release 2.8', '2.8.1': 'Release 2.8.1',
      '2.8.2': 'Release 2.8.2', '2.9': 'Release 2.9',
    },
  },
  '0105': {
    name: 'Source of Comment',
    codes: { L: 'Ancillary (filler) department is source of comment', O: 'Other system is source of comment', P: 'Orderer (placer) is source of comment' },
  },
  '0119': {
    name: 'Order Control Codes',
    codes: {
      CA: 'Cancel order/service request', CH: 'Child order/service', CN: 'Combined result', CR: 'Canceled as requested', DC: 'Discontinue order/service request',
      DE: 'Data errors', HD: 'Hold order request', NA: 'Number assigned', NW: 'New order/service', OC: 'Order/service canceled',
      OD: 'Order/service discontinued', OE: 'Order/service released', OH: 'Order/service held', OK: 'Order/service accepted & OK',
      PA: 'Parent order/service', RE: 'Observations/Performed Service to follow', RL: 'Release previous hold', RO: 'Replacement order',
      RP: 'Order/service replace request', RQ: 'Replaced as requested', RR: 'Request received', RU: 'Replaced unsolicited', SC: 'Status changed',
      SN: 'Send order/service number', UA: 'Unable to accept order/service', UC: 'Unable to cancel', UD: 'Unable to discontinue', XO: 'Change order/service request',
      XR: 'Changed as requested', XX: 'Order/service changed, unsolicited',
    },
  },
  '0123': {
    name: 'Result Status',
    codes: {
      A: 'Some, but not all, results available', C: 'Correction to results', F: 'Final results', I: 'No results available; specimen received, procedure incomplete',
      M: 'Corrected, not yet verified', N: 'Procedure completed, results pending', O: 'Order received; specimen not yet received', P: 'Preliminary',
      R: 'Results stored; not yet verified', S: 'No results available; procedure scheduled, but not done', X: 'No results available; order canceled',
      Y: 'No order on record for this test', Z: 'No record of this patient',
    },
  },
  '0125': {
    name: 'Value Type',
    codes: {
      AD: 'Address', CE: 'Coded Entry', CNE: 'Coded with No Exceptions', CWE: 'Coded with Exceptions', CX: 'Extended Composite ID With Check Digit',
      DT: 'Date', DTM: 'Date/Time', ED: 'Encapsulated Data', FT: 'Formatted Text (Display)', ID: 'Coded Value for HL7 Defined Tables',
      IS: 'Coded Value for User-Defined Tables', NM: 'Numeric', RP: 'Reference Pointer', SI: 'Sequence ID', SN: 'Structured Numeric', ST: 'String Data',
      TM: 'Time', TS: 'Time Stamp (Date & Time)', TX: 'Text Data (Display)', XAD: 'Extended Address', XCN: 'Extended Composite Name And Number For Persons',
      XON: 'Extended Composite Name and Identification Number For Organizations', XPN: 'Extended Person Name', XTN: 'Extended Telecommunications Number',
    },
  },
  '0127': {
    name: 'Allergen Type',
    codes: { AA: 'Animal Allergy', DA: 'Drug allergy', EA: 'Environmental Allergy', FA: 'Food allergy', LA: 'Pollen Allergy', MA: 'Miscellaneous allergy', MC: 'Miscellaneous contraindication', PA: 'Plant Allergy' },
  },
  '0128': { name: 'Allergy Severity', codes: { MI: 'Mild', MO: 'Moderate', SV: 'Severe', U: 'Unknown' } },
  '0357': {
    name: 'Message Error Condition Codes',
    codes: {
      100: 'Segment sequence error', 101: 'Required field missing', 102: 'Data type error', 103: 'Table value not found',
      200: 'Unsupported message type', 201: 'Unsupported event code', 202: 'Unsupported processing id', 203: 'Unsupported version id',
      204: 'Unknown key identifier', 205: 'Duplicate key identifier', 206: 'Application record locked', 207: 'Application internal error',
    },
  },
  '0323': { name: 'Allergy Action Code', codes: { A: 'Add/Insert', D: 'Delete', U: 'Update', X: 'No change' } },
  '0136': { name: 'Yes/No Indicator', codes: { Y: 'Yes', N: 'No' } },
  '0155': { name: 'Accept/Application Acknowledgment Conditions', codes: { AL: 'Always', ER: 'Error/reject conditions only', NE: 'Never', SU: 'Successful completion only' } },
  '0189': { name: 'Ethnic Group', codes: { H: 'Hispanic or Latino', N: 'Not Hispanic or Latino', U: 'Unknown' } },
  '0190': {
    name: 'Address Type',
    codes: { B: 'Firm/Business', BA: 'Bad address', C: 'Current Or Temporary', F: 'Country Of Origin', H: 'Home', L: 'Legal Address', M: 'Mailing', N: 'Birth (nee)', O: 'Office', P: 'Permanent', SH: 'Shipping', V: 'Vacation' },
  },
  '0200': {
    name: 'Name Type',
    codes: { A: 'Alias Name', B: 'Name at Birth', C: 'Adopted Name', D: 'Customary Name', K: 'Business name', L: 'Official Registry Name / Legal Name', M: 'Maiden Name', N: 'Nickname', P: 'Name of Partner/Spouse', R: 'Registered Name', S: 'Coded Pseudo-Name', U: 'Unspecified' },
  },
  '0201': {
    name: 'Telecommunication Use Code',
    codes: { ASN: 'Answering Service Number', BPN: 'Beeper Number', EMR: 'Emergency Number', NET: 'Network (email) Address', ORN: 'Other Residence Number', PRN: 'Primary Residence Number', PRS: 'Personal', VHN: 'Vacation Home Number', WPN: 'Work Number' },
  },
  '0202': {
    name: 'Telecommunication Equipment Type',
    codes: { BP: 'Beeper', CP: 'Cellular or Mobile Phone', FX: 'Fax', Internet: 'Internet Address', MD: 'Modem', PH: 'Telephone', SAT: 'Satellite Phone', TDD: 'Telecommunications Device for the Deaf', TTY: 'Teletypewriter', X400: 'X.400 email address' },
  },
  '0203': {
    name: 'Identifier Type',
    codes: {
      AN: 'Account number', DL: "Driver's license number", DN: 'Doctor number', EI: 'Employee number', FI: 'Facility ID', MA: 'Medicaid number', MC: 'Medicare number',
      MR: 'Medical record number', NPI: 'National provider identifier', PI: 'Patient internal identifier', PN: 'Person number', PRN: 'Provider number',
      PT: 'Patient external identifier', SS: 'Social Security number', U: 'Unspecified', VN: 'Visit number', XX: 'Organization identifier',
    },
  },
  '0516': { name: 'Error Severity', codes: { E: 'Error', F: 'Fatal Error', I: 'Information', W: 'Warning' } },
};

/** Description of `code` in `table`, or null when the table or code is not known. */
function lookup(table, code) {
  const t = TABLES[table];
  if (!t) return null;
  return Object.hasOwn(t.codes, code) ? t.codes[code] : null;
}

function tableName(table) {
  return TABLES[table] ? TABLES[table].name : null;
}

module.exports = { TABLES, lookup, tableName };
