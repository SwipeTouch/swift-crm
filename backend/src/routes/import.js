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

function buildHeaderMap(headerRow) {
  const map = {};
  headerRow.forEach((raw, idx) => {
    const h = String(raw || '').trim().toLowerCase();
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(h)) map[field] = idx;
    }
  });
  return map;
}

function normalizeContactType(v) {
  const s = String(v || '').trim().toUpperCase();
  if (s.startsWith('INFLU')) return 'INFLUENCER';
  if (s.startsWith('PROMOT')) return 'PROMOTER';
  return null;
}

// Match an imported stage value to a configured stage id (by id or name), else the first stage.
function normalizeStage(v, stages) {
  const s = String(v || '').trim().toLowerCase();
  const match = stages.find((st) => st.id.toLowerCase() === s || st.name.toLowerCase() === s);
  return match ? match.id : stages[0].id;
}

const IMPORT_HEADERS = [
  'School Name', 'Board', 'Student Strength', 'Region', 'Location',
  'Contact Name', 'Contact Type', 'Contact Phone', 'Stage', 'Source',
  'Total Contract Value', 'PSPM Rate', 'CAC', 'Lead Date', 'Reminder',
];

// Example schools covering regions, boards, stages, and both contact types.
const SAMPLE_ROWS = [
  ['Delhi Public School', 'CBSE', 1200, 'North', 'New Delhi', 'Mr Sharma', 'Promoter', '9876543210', 'Cold', 'Field visit', 500000, 250, 15000, '2026-10-01', '2026-11-15'],
  ["St Xavier's High School", 'ICSE', 800, 'South', 'Chennai', 'Mrs Rao', 'Influencer', '9840011122', 'Warm', 'Referral', 350000, 200, 12000, '2026-09-12', '2026-11-20'],
  ['Kendriya Vidyalaya', 'CBSE', 1500, 'West', 'Pune', 'Mr Kadam', 'Promoter', '9822012345', 'Hot', 'Exhibition', 750000, 180, 18000, '2026-08-20', '2026-11-10'],
  ['Greenwood Public School', 'State Board', 450, 'East', 'Kolkata', 'Ms Iyer', 'Influencer', '9830012345', 'Negotiation', 'Website', 220000, 150, 8000, '2026-07-05', '2026-11-18'],
  ['Ryan International School', 'CBSE', 2000, 'North', 'Jaipur', 'Mr Mehta', 'Promoter', '9810011223', 'Cold', 'Cold call', 900000, 220, 20000, '2026-10-15', ''],
  ['DAV Public School', 'CBSE', 600, 'South', 'Bengaluru', 'Mrs Nair', 'Influencer', '9900012345', 'Warm', 'Partner', 280000, 175, 9000, '2026-09-28', '2026-12-01'],
  ['City Montessori School', 'ICSE', 3000, 'North', 'Lucknow', 'Mr Verma', 'Promoter', '9790012345', 'Closure', 'Field visit', 1200000, 160, 25000, '2026-06-01', ''],
  ['Bhavans Vidyalaya', 'State Board', 350, 'West', 'Ahmedabad', 'Ms Desai', 'Influencer', '9720012345', 'Not Int.', 'Cold call', '', '', 4000, '2026-10-20', '2026-11-25'],
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

// GET /api/import/template — header row plus one example
router.get('/template', requireRole('SUPER_ADMIN', 'MANAGER'), (req, res) => {
  sendWorkbook(res, [IMPORT_HEADERS, SAMPLE_ROWS[0]], 'leads-import-template.xlsx');
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
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse the file. Please upload a valid .xlsx/.csv.' });
  }
  if (!rows || rows.length < 2) {
    return res.status(400).json({ error: 'The file has no data rows below the header.' });
  }

  const headerMap = buildHeaderMap(rows[0]);
  if (headerMap.schoolName === undefined) {
    return res.status(400).json({ error: 'Could not find a "School Name" column in the header row.' });
  }

  const defaultFunnelId = req.body.funnelId ? parseInt(req.body.funnelId, 10) : null;
  // A posted default funnel must belong to this tenant.
  if (defaultFunnelId) {
    const f = await prisma.funnel.findFirst({ where: { id: defaultFunnelId, tenantId: req.tenantId }, select: { id: true } });
    if (!f) return res.status(400).json({ error: 'The selected funnel is not valid for this client' });
  }
  const defaultOwnerId = req.user.role === 'SALES_REP' ? req.user.id : null;

  const toCreate = [];
  const errors = [];
  const get = (row, field) => (headerMap[field] !== undefined ? row[headerMap[field]] : '');

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const schoolName = String(get(row, 'schoolName') || '').trim();
    if (!schoolName) {
      errors.push({ row: i + 1, error: 'Missing school name' });
      continue;
    }
    const strengthRaw = get(row, 'studentStrength');
    let studentStrength = null;
    if (strengthRaw !== '' && strengthRaw !== null && strengthRaw !== undefined) {
      const n = parseInt(String(strengthRaw).replace(/[^0-9]/g, ''), 10);
      studentStrength = Number.isNaN(n) ? null : n;
    }
    const stage = normalizeStage(get(row, 'stage'), cfg.stages);
    const toNum = (v) => {
      if (v === '' || v === null || v === undefined) return null;
      const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
      return Number.isNaN(n) ? null : n;
    };
    const toDate = (v) => {
      if (!v) return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
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
      reminderAt: toDate(get(row, 'reminderAt')),
      funnelId: defaultFunnelId,
      ownerId: defaultOwnerId,
    };
    const ld = toDate(get(row, 'leadDate'));
    if (ld) lead.leadDate = ld;
    toCreate.push(lead);
  }

  if (toCreate.length === 0) {
    return res.status(400).json({ error: 'No valid rows found', errors });
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

  res.status(201).json({ created, skipped: errors.length, errors });
});

module.exports = router;
