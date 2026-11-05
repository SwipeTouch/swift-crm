const prisma = require('../db');

// Column keys the leads pool can show (must match the frontend's list).
const ALL_COLUMN_KEYS = [
  'board', 'studentStrength', 'totalContractValue', 'cac', 'ageing',
  'reminder', 'region', 'contact', 'funnel', 'owner', 'stage',
];

const DEFAULT_STAGES = [
  { id: 'cold', name: 'Cold', color: '#8c8c8c' },
  { id: 'warm', name: 'Warm', color: '#faad14' },
  { id: 'hot', name: 'Hot', color: '#f5222d' },
  { id: 'negotiation', name: 'Negotiation', color: '#722ed1' },
  { id: 'closure', name: 'Closure', color: '#52c41a' },
  { id: 'not-interested', name: 'Not Int.', color: '#a8071a' },
  { id: 'stale', name: 'Stale', color: '#595959' },
];

// Default Purchase Order template (admin edits these in Configuration).
const DEFAULT_PO_TEMPLATE = {
  companyName: 'SwipeTouch Edutech Pvt Ltd',
  companyAddress: '11th Floor, Cloud 9 Tower, Sector 1, Vaishali, Uttar Pradesh',
  companyPhone: '',
  companyEmail: '',
  productName: 'SwiftCampus School ERP Software',
  numberPrefix: 'PO',
  bankDetails: [
    'A/c Name: SWIPETOUCH EDUTECH PRIVATE LIMITED',
    'A/c No: 334605000868',
    'Bank: ICICI Bank',
    'Branch: City Center, Luby Circular Road, Dhanbad',
    'IFSC: ICIC0003346',
  ].join('\n'),
  modules: [
    'Admission Enquiry Management (OTP verification, follow-up reminders)',
    'Student Information System (360° view, fees status, I-card design)',
    'Student Attendance System (SMS/notification linked)',
    'Fee Management (counter collection, transport fee, discounts, reports)',
    'Assignment Management (homework, attachments, correction)',
    'Communication Management (template SMS, smartphone notifications)',
    'Certificate Generation (TC, Bonafide, Character; bulk TC)',
    'Staff Management (personal & academic details, roles & permissions)',
    'Staff Attendance (biometric integration, daily & monthly reports)',
    'Report Card Generation (CBSE + HPC, marks entry, analysis)',
    'Mobile Apps for Parents, Teachers & Management',
    'Library Module, Inventory Module, Payroll Module',
  ].join('\n'),
  terms: [
    'Company will start working on the project on receiving a written work order along with implementation charges as an advance payment.',
    'As per Government rule, GST will be charged @ 18% extra on the given price; taxes may change as per govt. norms.',
    'Training sessions will be imparted to direct users (staff) and the ERP co-ordinator after master configuration of respective modules.',
    'On completion of on-site implementation, the online team will render future assistance remotely. Company is not liable for non-usage of modules.',
    'Software service charges are effective from the date utilization of Fee Collection, Mobile Apps and Communication Management starts.',
    'Company ensures functionality for the agreement period; all updates, essential changes and training are provided free of cost during this period.',
    'Any additional module beyond the agreed scope will be charged additionally as per mutual agreement.',
    'School management must provide all customization requirements with a clear scope in the kick-off meeting before implementation.',
    'SMS used beyond the free limit will be charged as per the SMS service provider bill.',
    'Exit Policy: The agreement can be terminated with 15 days notice within the first 6 months, and a minimum 3 months notice thereafter. One-time implementation & training cost is non-refundable.',
  ].join('\n'),
};

// Merge stored template overrides onto the defaults.
function effectivePoTemplate(cfg) {
  return { ...DEFAULT_PO_TEMPLATE, ...(cfg && cfg.poTemplate ? cfg.poTemplate : {}) };
}

// Returns the tenant's config row, creating it with defaults on first use.
async function getConfig(tenantId) {
  if (!tenantId) throw new Error('getConfig requires a tenantId');
  let cfg = await prisma.appConfig.findUnique({ where: { tenantId } });
  if (!cfg) {
    cfg = await prisma.appConfig.create({
      data: { tenantId, stages: DEFAULT_STAGES, repColumns: ALL_COLUMN_KEYS },
    });
  }
  return cfg;
}

module.exports = { getConfig, DEFAULT_STAGES, ALL_COLUMN_KEYS, DEFAULT_PO_TEMPLATE, effectivePoTemplate };
