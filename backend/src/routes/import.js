const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getConfig } = require('../lib/config');

const router = express.Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Maps many possible spreadsheet header spellings to our lead fields.
const HEADER_ALIASES = {
  schoolName: ['school name', 'school', 'name', 'institution'],
  board: ['board', 'school board'],
  studentStrength: ['student strength', 'students', 'strength', 'student count', 'no of students'],
  region: ['region', 'zone', 'state'],
  location: ['location', 'city', 'address', 'area'],
  contactName: ['contact name', 'contact', 'contact person'],
  contactType: ['contact type', 'type'],
  contactPhone: ['contact phone', 'phone', 'mobile', 'contact no', 'contact number'],
  stage: ['stage', 'level'],
  source: ['source'],
  totalContractValue: ['total contract value', 'tcv', 'contract value'],
  pspmRate: ['pspm rate', 'pspm', 'per student per month'],
  cac: ['cac', 'cost of customer acquisition', 'customer acquisition cost', 'acquisition cost'],
  leadDate: ['lead date', 'date'],
  reminderAt: ['reminder', 'reminder date', 'notification reminder'],
};

// Columns are keyed by letter. Headers we do not recognise are returned so they can be reported.
function buildHeaderMap(headerRow) {
  const map = {};
  const ignored = [];
  Object.entries(headerRow).forEach(([col, raw]) => {
    const name = String(raw ?? '').trim();
    if (!name) return;
    const h = name.toLowerCase();
    const field = Object.keys(HEADER_ALIASES).find((f) => HEADER_ALIASES[f].includes(h));
    if (field) map[field] = col;
    else ignored.push(name);
  });
  return { map, ignored };
}

function normalizeContactType(v) {
  const s = String(v || '').trim().toUpperCase();
  if (s.startsWith('INFLU')) return 'INFLUENCER';
  if (s.startsWith('PROMOT')) return 'PROMOTER';
  return null;
}

// Match an imported stage value to a configured stage id (by id or name).
// Blank means the first stage; an unrecognised value returns null.
function normalizeStage(v, stages) {
  const s = String(v ?? '').trim().toLowerCase().replace(/\./g, '');
  if (!s) return stages[0].id;
  const aliases = {
    'not interested': 'not-interested',
    'not int': 'not-interested',
  };
  const alias = aliases[s];
  const match = stages.find((st) => {
    const id = st.id.toLowerCase();
    const name = st.name.toLowerCase().replace(/\./g, '');
    return id === s || name === s || id === alias;
  });
  return match ? match.id : null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// UTC midnight for a real calendar date between 1990 and 2100, else null.
function utcDate(y, m, d) {
  const year = y < 100 ? 2000 + y : y;
  if (year < 1990 || year > 2100) return null;
  const date = new Date(Date.UTC(year, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

const monthNumber = (name) => {
  const s = name.toLowerCase();
  const i = MONTHS.findIndex((m) => s.startsWith(m));
  return i + 1;
};

// Reads an Excel serial number or a written date. Slashed dates are day first.
// Returns null for a blank cell and undefined when the value cannot be read.
function parseDate(v, date1904) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(s)) {
    const p = XLSX.SSF.parse_date_code(Number(s), { date1904 });
    if (!p || !utcDate(p.y, p.m, p.d)) return undefined;
    return new Date(Date.UTC(p.y, p.m - 1, p.d, p.H, p.M, p.S));
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}[T ]\d/.test(s)) {
    const d = new Date(s);
    const y = d.getUTCFullYear();
    return y >= 1990 && y <= 2100 ? d : undefined;
  }
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return utcDate(+m[1], +m[2], +m[3]) || undefined;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/);
  if (m) return utcDate(+m[3], +m[2], +m[1]) || undefined;
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[-\s,]+([a-z]{3,9})\.?[-\s,]+(\d{4}|\d{2})$/i);
  if (m) return utcDate(+m[3], monthNumber(m[2]), +m[1]) || undefined;
  m = s.match(/^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?[\s,]+(\d{4})$/i);
  if (m) return utcDate(+m[3], monthNumber(m[1]), +m[2]) || undefined;
  return undefined;
}

const IMPORT_HEADERS = [
  'School Name', 'Board', 'Student Strength', 'Region', 'Location',
  'Contact Name', 'Contact Type', 'Contact Phone', 'Stage', 'Source',
  'Total Contract Value', 'PSPM Rate', 'CAC', 'Lead Date', 'Reminder',
];

// One example school for every stage, so the sample shows how each value is written.
const SAMPLE_ROWS = [
  ['Delhi Public School', 'CBSE', 1200, 'North', 'New Delhi', 'Mr Sharma', 'Promoter', '9876543210', 'Cold', 'Field visit', 500000, 250, 15000, '2026-10-01', '2026-11-15'],
  ["St Xavier's High School", 'ICSE', 800, 'South', 'Chennai', 'Mrs Rao', 'Influencer', '9840011122', 'Warm', 'Referral', 350000, 200, 12000, '2026-09-12', '2026-11-20'],
  ['Kendriya Vidyalaya', 'CBSE', 1500, 'West', 'Pune', 'Mr Kadam', 'Promoter', '9822012345', 'Hot', 'Exhibition', 750000, 180, 18000, '2026-08-20', '2026-11-10'],
  ['Greenwood Public School', 'State Board', 450, 'East', 'Kolkata', 'Ms Iyer', 'Influencer', '9830012345', 'Negotiation', 'Website', 220000, 150, 8000, '2026-07-05', '2026-11-18'],
  ['City Montessori School', 'ICSE', 3000, 'North', 'Lucknow', 'Mr Verma', 'Promoter', '9790012345', 'Closure', 'Field visit', 1200000, 160, 25000, '2026-06-01', ''],
  ['Bhavans Vidyalaya', 'State Board', 350, 'West', 'Ahmedabad', 'Ms Desai', 'Influencer', '9720012345', 'Not Interested', 'Cold call', 0, 0, 4000, '2026-10-20', '2026-11-25'],
  ['Ryan International School', 'CBSE', 2000, 'North', 'Jaipur', 'Mr Mehta', 'Promoter', '9810011223', 'Stale', 'Cold call', 900000, 220, 20000, '2026-04-15', ''],
  ['DAV Public School', 'CBSE', 600, 'South', 'Bengaluru', 'Mrs Nair', 'Influencer', '9900012345', 'Warm', 'Partner', 280000, 175, 9000, '2026-09-28', '2026-12-01'],
  ['National Public School', 'CBSE', 1800, 'South', 'Bengaluru', 'Mr Krishnan', 'Promoter', '9880012345', 'Hot', 'Exhibition', 640000, 190, 16000, '2026-08-02', '2026-11-28'],
];

function sendWorkbook(res, rows, filename) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
}

// GET /api/import/template — header row only, so it stays distinct from the filled sample.
router.get('/template', requireRole('SUPER_ADMIN', 'MANAGER'), (req, res) => {
  sendWorkbook(res, [IMPORT_HEADERS], 'leads-import-template.xlsx');
});

// GET /api/import/sample — header row plus several example schools
router.get('/sample', requireRole('SUPER_ADMIN', 'MANAGER'), (req, res) => {
  sendWorkbook(res, [IMPORT_HEADERS, ...SAMPLE_ROWS], 'leads-import-sample.xlsx');
});

// POST /api/import — Admin + Manager. multipart: file=<xlsx>, funnelId=<optional default funnel>
router.post('/', requireRole('SUPER_ADMIN', 'MANAGER'), upload.single('file'), async (req, res) => {
  const cfg = await getConfig(req.tenantId);
  if (cfg.readOnly && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'The system is in read-only mode (set by the administrator).' });
  }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name "file")' });

  let rows;
  let date1904 = false;
  try {
    // raw keeps CSV text as typed, so SheetJS does not read dd/mm dates as mm/dd.
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', raw: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    date1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
    rows = XLSX.utils.sheet_to_json(sheet, { header: 'A', blankrows: false, defval: '' });
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse the file. Please upload a valid .xlsx/.csv.' });
  }
  if (!rows || rows.length < 2) {
    return res.status(400).json({ error: 'The file has no data rows below the header.' });
  }

  const { map: headerMap, ignored: ignoredColumns } = buildHeaderMap(rows[0]);
  if (headerMap.schoolName === undefined) {
    return res.status(400).json({ error: 'Could not find a "School Name" column in the header row.', ignoredColumns });
  }

  const defaultFunnelId = req.body.funnelId ? parseInt(req.body.funnelId, 10) : null;
  if (!defaultFunnelId) {
    return res.status(400).json({ error: 'Choose a funnel. Every imported row must be assigned to one.' });
  }
  const useCalendarDate = req.body.dateMode === 'calendar';
  let calendarDate = null;
  if (useCalendarDate) {
    calendarDate = new Date(req.body.leadDate);
    if (Number.isNaN(calendarDate.getTime())) {
      return res.status(400).json({ error: 'Pick a lead date on the calendar' });
    }
  }
  // A posted default funnel must belong to this tenant.
  if (defaultFunnelId) {
    const f = await prisma.funnel.findFirst({ where: { id: defaultFunnelId, tenantId: req.tenantId }, select: { id: true } });
    if (!f) return res.status(400).json({ error: 'The selected funnel is not valid for this client' });
  }
  const defaultOwnerId = req.user.role === 'SALES_REP' ? req.user.id : null;

  const toCreate = [];
  const errors = [];
  const warnings = [];
  const get = (row, field) => (headerMap[field] !== undefined ? row[headerMap[field]] : '');

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = row.__rowNum__ + 1;
    const schoolName = String(get(row, 'schoolName') || '').trim();
    if (!schoolName) {
      errors.push({ row: rowNumber, error: 'Missing school name' });
      continue;
    }
    const strengthRaw = get(row, 'studentStrength');
    let studentStrength = null;
    if (strengthRaw !== '' && strengthRaw !== null && strengthRaw !== undefined) {
      const n = parseInt(String(strengthRaw).replace(/[^0-9]/g, ''), 10);
      studentStrength = Number.isNaN(n) ? null : n;
    }
    const stageRaw = get(row, 'stage');
    const stage = normalizeStage(stageRaw, cfg.stages);
    if (!stage) {
      const value = String(stageRaw).trim();
      errors.push({
        row: rowNumber,
        column: 'Stage',
        value,
        error: `Stage "${value}" is not recognised. Use one of: ${cfg.stages.map((s) => s.name).join(', ')}.`,
      });
      continue;
    }
    const toNum = (v) => {
      if (v === '' || v === null || v === undefined) return null;
      const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
      return Number.isNaN(n) ? null : n;
    };
    // Unreadable dates are left out of the lead and reported.
    const toDate = (field, column, effect) => {
      const v = get(row, field);
      const d = parseDate(v, date1904);
      if (d !== undefined) return d;
      const value = String(v).trim();
      warnings.push({ row: rowNumber, column, value, warning: `${column} "${value}" is not a date we can read. ${effect}` });
      return null;
    };
    const lead = {
      schoolName,
      board: String(get(row, 'board') || '').trim() || null,
      studentStrength,
      region: String(get(row, 'region') || '').trim() || null,
      location: String(get(row, 'location') || '').trim() || null,
      contactName: String(get(row, 'contactName') || '').trim() || null,
      contactType: normalizeContactType(get(row, 'contactType')),
      contactPhone: String(get(row, 'contactPhone') || '').trim() || null,
      stage,
      source: String(get(row, 'source') || '').trim() || 'XLSX import',
      totalContractValue: toNum(get(row, 'totalContractValue')),
      pspmRate: toNum(get(row, 'pspmRate')),
      cac: toNum(get(row, 'cac')),
      reminderAt: toDate('reminderAt', 'Reminder', 'No reminder was set.'),
      funnelId: defaultFunnelId,
      ownerId: defaultOwnerId,
    };
    if (useCalendarDate) {
      lead.leadDate = calendarDate;
    } else {
      const ld = toDate('leadDate', 'Lead Date', 'The import date was used instead.');
      if (ld) lead.leadDate = ld;
    }
    toCreate.push(lead);
  }

  if (toCreate.length === 0) {
    return res.status(400).json({ error: 'No valid rows found', errors, warnings, ignoredColumns });
  }

  // Create leads + their initial stage-history + an import batch record in one transaction.
  const created = await prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({
      data: { tenantId: req.tenantId, filename: req.file.originalname || 'upload.xlsx', rowCount: toCreate.length, uploadedById: req.user.id },
    });
    for (const lead of toCreate) {
      await tx.lead.create({
        data: {
          ...lead,
          tenantId: req.tenantId,
          history: { create: { tenantId: req.tenantId, toStage: lead.stage, note: `Imported (batch ${batch.id})`, changedById: req.user.id } },
        },
      });
    }
    return toCreate.length;
  });

  res.status(201).json({ created, skipped: errors.length, errors, warnings, ignoredColumns });
});

module.exports = router;
