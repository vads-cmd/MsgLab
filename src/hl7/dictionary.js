'use strict';

/**
 * Names of segments, fields and components (modelled on HL7 v2.5.1; other versions are read leniently).
 *
 * A field is described as [number, name, dataType, tables]. A data type ending in "*" may repeat.
 * `tables` maps a component number to the code table that applies to it, for example { 1: '0001' }.
 */

/** Component names of composite data types. */
const COMPOSITES = {
  CE: ['Identifier', 'Text', 'Name of Coding System', 'Alternate Identifier', 'Alternate Text', 'Name of Alternate Coding System'],
  CWE: ['Identifier', 'Text', 'Name of Coding System', 'Alternate Identifier', 'Alternate Text', 'Name of Alternate Coding System', 'Coding System Version ID', 'Alternate Coding System Version ID', 'Original Text'],
  CNE: ['Identifier', 'Text', 'Name of Coding System', 'Alternate Identifier', 'Alternate Text', 'Name of Alternate Coding System', 'Coding System Version ID', 'Alternate Coding System Version ID', 'Original Text'],
  CX: ['ID Number', 'Check Digit', 'Check Digit Scheme', 'Assigning Authority', 'Identifier Type Code', 'Assigning Facility', 'Effective Date', 'Expiration Date'],
  XPN: ['Family Name', 'Given Name', 'Second and Further Given Names or Initials', 'Suffix', 'Prefix', 'Degree', 'Name Type Code', 'Name Representation Code', 'Name Context', 'Name Validity Range', 'Name Assembly Order'],
  XAD: ['Street Address', 'Other Designation', 'City', 'State or Province', 'Zip or Postal Code', 'Country', 'Address Type', 'Other Geographic Designation', 'County/Parish Code', 'Census Tract'],
  XTN: ['Telephone Number', 'Telecommunication Use Code', 'Telecommunication Equipment Type', 'Email Address', 'Country Code', 'Area/City Code', 'Local Number', 'Extension', 'Any Text'],
  XCN: ['ID Number', 'Family Name', 'Given Name', 'Second and Further Given Names or Initials', 'Suffix', 'Prefix', 'Degree', 'Source Table', 'Assigning Authority', 'Name Type Code', 'Identifier Check Digit', 'Check Digit Scheme', 'Identifier Type Code'],
  XON: ['Organization Name', 'Organization Name Type Code', 'ID Number', 'Check Digit', 'Check Digit Scheme', 'Assigning Authority', 'Identifier Type Code', 'Assigning Facility', 'Name Representation Code', 'Organization Identifier'],
  EI: ['Entity Identifier', 'Namespace ID', 'Universal ID', 'Universal ID Type'],
  HD: ['Namespace ID', 'Universal ID', 'Universal ID Type'],
  PL: ['Point of Care', 'Room', 'Bed', 'Facility', 'Location Status', 'Person Location Type', 'Building', 'Floor', 'Location Description'],
  MSG: ['Message Code', 'Trigger Event', 'Message Structure'],
  PT: ['Processing ID', 'Processing Mode'],
  VID: ['Version ID', 'Internationalization Code', 'International Version ID'],
  TS: ['Time', 'Degree of Precision'],
  CQ: ['Quantity', 'Units'],
  ELD: ['Segment ID', 'Sequence', 'Field Position', 'Code Identifying Error'],
  ERL: ['Segment ID', 'Segment Sequence', 'Field Position', 'Field Repetition', 'Component Number', 'Sub-Component Number'],
  TQ: ['Quantity', 'Interval', 'Duration', 'Start Date/Time', 'End Date/Time', 'Priority', 'Condition', 'Text', 'Conjunction', 'Order Sequencing'],
};

const DATA_TYPE_NAMES = {
  ST: 'String', TX: 'Text', FT: 'Formatted Text', NM: 'Numeric', SI: 'Sequence ID', ID: 'Coded value (HL7 table)', IS: 'Coded value (user table)',
  DT: 'Date', TM: 'Time', DTM: 'Date/Time', TS: 'Time Stamp', varies: 'Varies (see OBX-2)', CE: 'Coded Element', CWE: 'Coded with Exceptions',
  CNE: 'Coded with No Exceptions', CX: 'Extended Composite ID', XPN: 'Extended Person Name', XAD: 'Extended Address',
  XTN: 'Extended Telecommunication Number', XCN: 'Extended Composite ID Number and Name for Persons', XON: 'Extended Composite Name for Organizations',
  EI: 'Entity Identifier', HD: 'Hierarchic Designator', PL: 'Person Location', MSG: 'Message Type', PT: 'Processing Type', VID: 'Version Identifier',
  CQ: 'Composite Quantity with Units', ELD: 'Error Location and Description', ERL: 'Error Location', TQ: 'Timing/Quantity',
};

const SEGMENTS = {};

/** Register a segment definition. */
function def(name, description, fields) {
  const byNo = {};
  const list = fields.map(([seq, fieldName, dt, tables = {}]) => {
    const repeats = dt.endsWith('*');
    const field = { seq, name: fieldName, dt: repeats ? dt.slice(0, -1) : dt, repeats, tables };
    byNo[seq] = field;
    return field;
  });
  SEGMENTS[name] = { name: description, fields: list, byNo };
}

def('MSH', 'Message Header', [
  [1, 'Field Separator', 'ST'], [2, 'Encoding Characters', 'ST'], [3, 'Sending Application', 'HD'], [4, 'Sending Facility', 'HD'],
  [5, 'Receiving Application', 'HD'], [6, 'Receiving Facility', 'HD'], [7, 'Date/Time Of Message', 'TS'], [8, 'Security', 'ST'],
  [9, 'Message Type', 'MSG', { 1: '0076', 2: '0003' }], [10, 'Message Control ID', 'ST'], [11, 'Processing ID', 'PT', { 1: '0103' }],
  [12, 'Version ID', 'VID', { 1: '0104' }], [13, 'Sequence Number', 'NM'], [14, 'Continuation Pointer', 'ST'],
  [15, 'Accept Acknowledgment Type', 'ID', { 1: '0155' }], [16, 'Application Acknowledgment Type', 'ID', { 1: '0155' }],
  [17, 'Country Code', 'ID'], [18, 'Character Set', 'ID*'], [19, 'Principal Language Of Message', 'CE'],
  [20, 'Alternate Character Set Handling Scheme', 'ID'], [21, 'Message Profile Identifier', 'EI*'],
]);

def('SFT', 'Software Segment', [
  [1, 'Software Vendor Organization', 'XON'], [2, 'Software Certified Version or Release Number', 'ST'], [3, 'Software Product Name', 'ST'],
  [4, 'Software Binary ID', 'ST'], [5, 'Software Product Information', 'TX'], [6, 'Software Install Date', 'TS'],
]);

def('EVN', 'Event Type', [
  [1, 'Event Type Code', 'ID', { 1: '0003' }], [2, 'Recorded Date/Time', 'TS'], [3, 'Date/Time Planned Event', 'TS'], [4, 'Event Reason Code', 'IS'],
  [5, 'Operator ID', 'XCN*'], [6, 'Event Occurred', 'TS'], [7, 'Event Facility', 'HD'],
]);

def('PID', 'Patient Identification', [
  [1, 'Set ID - PID', 'SI'], [2, 'Patient ID', 'CX'], [3, 'Patient Identifier List', 'CX*', { 5: '0203' }], [4, 'Alternate Patient ID - PID', 'CX*'],
  [5, 'Patient Name', 'XPN*', { 7: '0200' }], [6, "Mother's Maiden Name", 'XPN*', { 7: '0200' }], [7, 'Date/Time of Birth', 'TS'],
  [8, 'Administrative Sex', 'IS', { 1: '0001' }], [9, 'Patient Alias', 'XPN*'], [10, 'Race', 'CE*', { 1: '0005' }],
  [11, 'Patient Address', 'XAD*', { 7: '0190' }], [12, 'County Code', 'IS'], [13, 'Phone Number - Home', 'XTN*', { 2: '0201', 3: '0202' }],
  [14, 'Phone Number - Business', 'XTN*', { 2: '0201', 3: '0202' }], [15, 'Primary Language', 'CE'], [16, 'Marital Status', 'CE', { 1: '0002' }],
  [17, 'Religion', 'CE'], [18, 'Patient Account Number', 'CX', { 5: '0203' }], [19, 'SSN Number - Patient', 'ST'], [20, "Driver's License Number - Patient", 'DLN'],
  [21, "Mother's Identifier", 'CX*'], [22, 'Ethnic Group', 'CE*', { 1: '0189' }], [23, 'Birth Place', 'ST'], [24, 'Multiple Birth Indicator', 'ID', { 1: '0136' }],
  [25, 'Birth Order', 'NM'], [26, 'Citizenship', 'CE*'], [27, 'Veterans Military Status', 'CE'], [28, 'Nationality', 'CE'],
  [29, 'Patient Death Date and Time', 'TS'], [30, 'Patient Death Indicator', 'ID', { 1: '0136' }], [31, 'Identity Unknown Indicator', 'ID', { 1: '0136' }],
  [32, 'Identity Reliability Code', 'IS*'], [33, 'Last Update Date/Time', 'TS'], [34, 'Last Update Facility', 'HD'], [35, 'Species Code', 'CE'],
  [36, 'Breed Code', 'CE'], [37, 'Strain', 'ST'], [38, 'Production Class Code', 'CE*'], [39, 'Tribal Citizenship', 'CWE*'],
]);

def('NK1', 'Next of Kin / Associated Parties', [
  [1, 'Set ID - NK1', 'SI'], [2, 'Name', 'XPN*', { 7: '0200' }], [3, 'Relationship', 'CE', { 1: '0063' }], [4, 'Address', 'XAD*', { 7: '0190' }],
  [5, 'Phone Number', 'XTN*', { 2: '0201', 3: '0202' }], [6, 'Business Phone Number', 'XTN*', { 2: '0201', 3: '0202' }], [7, 'Contact Role', 'CE'],
  [8, 'Start Date', 'DT'], [9, 'End Date', 'DT'], [10, 'Next of Kin / Associated Parties Job Title', 'ST'], [13, 'Organization Name - NK1', 'XON*'],
  [14, 'Marital Status', 'CE', { 1: '0002' }], [15, 'Administrative Sex', 'IS', { 1: '0001' }], [16, 'Date/Time of Birth', 'TS'],
]);

def('PV1', 'Patient Visit', [
  [1, 'Set ID - PV1', 'SI'], [2, 'Patient Class', 'IS', { 1: '0004' }], [3, 'Assigned Patient Location', 'PL'], [4, 'Admission Type', 'IS', { 1: '0007' }],
  [5, 'Preadmit Number', 'CX'], [6, 'Prior Patient Location', 'PL'], [7, 'Attending Doctor', 'XCN*'], [8, 'Referring Doctor', 'XCN*'],
  [9, 'Consulting Doctor', 'XCN*'], [10, 'Hospital Service', 'IS'], [11, 'Temporary Location', 'PL'], [12, 'Preadmit Test Indicator', 'IS'],
  [13, 'Re-admission Indicator', 'IS'], [14, 'Admit Source', 'IS'], [15, 'Ambulatory Status', 'IS*'], [16, 'VIP Indicator', 'IS'],
  [17, 'Admitting Doctor', 'XCN*'], [18, 'Patient Type', 'IS'], [19, 'Visit Number', 'CX', { 5: '0203' }], [20, 'Financial Class', 'FC*'],
  [21, 'Charge Price Indicator', 'IS'], [22, 'Courtesy Code', 'IS'], [23, 'Credit Rating', 'IS'], [24, 'Contract Code', 'IS*'],
  [25, 'Contract Effective Date', 'DT*'], [26, 'Contract Amount', 'NM*'], [27, 'Contract Period', 'NM*'], [28, 'Interest Code', 'IS'],
  [29, 'Transfer to Bad Debt Code', 'IS'], [30, 'Transfer to Bad Debt Date', 'DT'], [31, 'Bad Debt Agency Code', 'IS'],
  [32, 'Bad Debt Transfer Amount', 'NM'], [33, 'Bad Debt Recovery Amount', 'NM'], [34, 'Delete Account Indicator', 'IS'],
  [35, 'Delete Account Date', 'DT'], [36, 'Discharge Disposition', 'IS'], [37, 'Discharged to Location', 'DLD'], [38, 'Diet Type', 'CE'],
  [39, 'Servicing Facility', 'IS'], [40, 'Bed Status', 'IS'], [41, 'Account Status', 'IS'], [42, 'Pending Location', 'PL'],
  [43, 'Prior Temporary Location', 'PL'], [44, 'Admit Date/Time', 'TS'], [45, 'Discharge Date/Time', 'TS*'], [46, 'Current Patient Balance', 'NM'],
  [47, 'Total Charges', 'NM'], [48, 'Total Adjustments', 'NM'], [49, 'Total Payments', 'NM'], [50, 'Alternate Visit ID', 'CX'],
  [51, 'Visit Indicator', 'IS'], [52, 'Other Healthcare Provider', 'XCN*'],
]);

def('PV2', 'Patient Visit - Additional Information', [
  [1, 'Prior Pending Location', 'PL'], [2, 'Accommodation Code', 'CE'], [3, 'Admit Reason', 'CE'], [4, 'Transfer Reason', 'CE'],
  [5, 'Patient Valuables', 'ST*'], [6, 'Patient Valuables Location', 'ST'], [7, 'Visit User Code', 'IS*'], [8, 'Expected Admit Date/Time', 'TS'],
  [9, 'Expected Discharge Date/Time', 'TS'],
]);

def('ORC', 'Common Order', [
  [1, 'Order Control', 'ID', { 1: '0119' }], [2, 'Placer Order Number', 'EI'], [3, 'Filler Order Number', 'EI'], [4, 'Placer Group Number', 'EI'],
  [5, 'Order Status', 'ID', { 1: '0038' }], [6, 'Response Flag', 'ID'], [7, 'Quantity/Timing', 'TQ*'], [8, 'Parent', 'PRL'],
  [9, 'Date/Time of Transaction', 'TS'], [10, 'Entered By', 'XCN*'], [11, 'Verified By', 'XCN*'], [12, 'Ordering Provider', 'XCN*'],
  [13, "Enterer's Location", 'PL'], [14, 'Call Back Phone Number', 'XTN*'], [15, 'Order Effective Date/Time', 'TS'],
  [16, 'Order Control Code Reason', 'CE'], [17, 'Entering Organization', 'CE'], [18, 'Entering Device', 'CE'], [19, 'Action By', 'XCN*'],
  [20, 'Advanced Beneficiary Notice Code', 'CE'], [21, 'Ordering Facility Name', 'XON*'], [22, 'Ordering Facility Address', 'XAD*'],
  [23, 'Ordering Facility Phone Number', 'XTN*'], [24, 'Ordering Provider Address', 'XAD*'],
]);

def('OBR', 'Observation Request', [
  [1, 'Set ID - OBR', 'SI'], [2, 'Placer Order Number', 'EI'], [3, 'Filler Order Number', 'EI'], [4, 'Universal Service Identifier', 'CE'],
  [5, 'Priority - OBR', 'ID'], [6, 'Requested Date/Time', 'TS'], [7, 'Observation Date/Time', 'TS'], [8, 'Observation End Date/Time', 'TS'],
  [9, 'Collection Volume', 'CQ'], [10, 'Collector Identifier', 'XCN*'], [11, 'Specimen Action Code', 'ID', { 1: '0065' }], [12, 'Danger Code', 'CE'],
  [13, 'Relevant Clinical Information', 'ST'], [14, 'Specimen Received Date/Time', 'TS'], [15, 'Specimen Source', 'SPS'],
  [16, 'Ordering Provider', 'XCN*'], [17, 'Order Callback Phone Number', 'XTN*'], [18, 'Placer Field 1', 'ST'], [19, 'Placer Field 2', 'ST'],
  [20, 'Filler Field 1', 'ST'], [21, 'Filler Field 2', 'ST'], [22, 'Results Rpt/Status Chng - Date/Time', 'TS'], [23, 'Charge to Practice', 'MOC'],
  [24, 'Diagnostic Serv Sect ID', 'ID'], [25, 'Result Status', 'ID', { 1: '0123' }], [26, 'Parent Result', 'PRL'], [27, 'Quantity/Timing', 'TQ*'],
  [28, 'Result Copies To', 'XCN*'], [29, 'Parent', 'EIP'], [30, 'Transportation Mode', 'ID'], [31, 'Reason for Study', 'CE*'],
  [32, 'Principal Result Interpreter', 'NDL'], [33, 'Assistant Result Interpreter', 'NDL*'], [34, 'Technician', 'NDL*'],
  [35, 'Transcriptionist', 'NDL*'], [36, 'Scheduled Date/Time', 'TS'],
]);

def('OBX', 'Observation/Result', [
  [1, 'Set ID - OBX', 'SI'], [2, 'Value Type', 'ID', { 1: '0125' }], [3, 'Observation Identifier', 'CE'], [4, 'Observation Sub-ID', 'ST'],
  [5, 'Observation Value', 'varies*'], [6, 'Units', 'CE'], [7, 'References Range', 'ST'], [8, 'Abnormal Flags', 'IS*', { 1: '0078' }],
  [9, 'Probability', 'NM'], [10, 'Nature of Abnormal Test', 'ID*'], [11, 'Observation Result Status', 'ID', { 1: '0085' }],
  [12, 'Effective Date of Reference Range', 'TS'], [13, 'User Defined Access Checks', 'ST'], [14, 'Date/Time of the Observation', 'TS'],
  [15, "Producer's ID", 'CE'], [16, 'Responsible Observer', 'XCN*'], [17, 'Observation Method', 'CE*'], [18, 'Equipment Instance Identifier', 'EI*'],
  [19, 'Date/Time of the Analysis', 'TS'],
]);

def('NTE', 'Notes and Comments', [
  [1, 'Set ID - NTE', 'SI'], [2, 'Source of Comment', 'ID', { 1: '0105' }], [3, 'Comment', 'FT*'], [4, 'Comment Type', 'CE'],
]);

def('AL1', 'Patient Allergy Information', [
  [1, 'Set ID - AL1', 'SI'], [2, 'Allergen Type Code', 'CE', { 1: '0127' }], [3, 'Allergen Code/Mnemonic/Description', 'CE'],
  [4, 'Allergy Severity Code', 'CE', { 1: '0128' }], [5, 'Allergy Reaction Code', 'ST*'], [6, 'Identification Date', 'DT'],
]);

def('DG1', 'Diagnosis', [
  [1, 'Set ID - DG1', 'SI'], [2, 'Diagnosis Coding Method', 'ID'], [3, 'Diagnosis Code - DG1', 'CE'], [4, 'Diagnosis Description', 'ST'],
  [5, 'Diagnosis Date/Time', 'TS'], [6, 'Diagnosis Type', 'IS', { 1: '0052' }], [7, 'Major Diagnostic Category', 'CE'],
  [8, 'Diagnostic Related Group', 'CE'], [9, 'DRG Approval Indicator', 'ID'],
]);

def('MSA', 'Message Acknowledgment', [
  [1, 'Acknowledgment Code', 'ID', { 1: '0008' }], [2, 'Message Control ID', 'ST'], [3, 'Text Message', 'ST'], [4, 'Expected Sequence Number', 'NM'],
  [5, 'Delayed Acknowledgment Type', 'ID'], [6, 'Error Condition', 'CE'],
]);

def('ERR', 'Error', [
  [1, 'Error Code and Location', 'ELD*'], [2, 'Error Location', 'ERL*'], [3, 'HL7 Error Code', 'CWE'], [4, 'Severity', 'ID', { 1: '0516' }],
  [5, 'Application Error Code', 'CWE'], [6, 'Application Error Parameter', 'ST*'], [7, 'Diagnostic Information', 'TX'], [8, 'User Message', 'TX'],
  [9, 'Inform Person Indicator', 'IS*'], [10, 'Override Type', 'CWE'], [11, 'Override Reason Code', 'CWE*'], [12, 'Help Desk Contact Point', 'XTN*'],
]);

// Segments that are known by name only (their fields are shown as "Field n")
for (const [name, description] of [
  ['PD1', 'Patient Additional Demographic'], ['IN1', 'Insurance'], ['IN2', 'Insurance Additional Information'], ['GT1', 'Guarantor'],
  ['PR1', 'Procedures'], ['ROL', 'Role'], ['DB1', 'Disability'], ['DRG', 'Diagnosis Related Group'], ['ACC', 'Accident'],
  ['UAC', 'User Authentication Credential'], ['SPM', 'Specimen'], ['TQ1', 'Timing/Quantity'], ['FT1', 'Financial Transaction'],
]) {
  def(name, description, []);
}

/** Names of the supported message types (MSH-9.1 ^ MSH-9.2). */
const MESSAGE_NAMES = {
  'ADT^A01': 'Admit/Visit Notification',
  'ADT^A02': 'Transfer a Patient',
  'ADT^A03': 'Discharge/End Visit',
  'ADT^A04': 'Register a Patient',
  'ADT^A08': 'Update Patient Information',
  'ORU^R01': 'Unsolicited Observation Result',
  'ORM^O01': 'General Order Message',
  ACK: 'General Acknowledgment',
};

function getSegment(name) {
  return SEGMENTS[name] || null;
}

function componentNames(dt) {
  return COMPOSITES[dt] || null;
}

function messageName(code, event) {
  return MESSAGE_NAMES[`${code}^${event}`] || MESSAGE_NAMES[code] || '';
}

module.exports = { SEGMENTS, COMPOSITES, DATA_TYPE_NAMES, MESSAGE_NAMES, getSegment, componentNames, messageName };
