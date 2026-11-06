const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getConfig, effectivePoTemplate } = require('../lib/config');
const { buildViewModel, generatePdf, generateDocx } = require('../lib/poDocument');
const { buildLeadScope, canViewLead, canEditLead, canDeleteLead } = require('../lib/leadAccess');

const router = express.Router();
router.use(requireAuth);

// Load per-request context: the funnels this user is scoped to, and app config.
router.use(async (req, res, next) => {
  try {
    if (req.user.role === 'SUPER_ADMIN') {
      req.userFunnelIds = null;
      req.userLocked = false;
      req.userCanExport = true;
    } else {
      const u = await prisma.user.findFirst({
        where: { id: req.user.id, tenantId: req.tenantId },
        select: { funnelAccess: { select: { id: true } }, locked: true, canExport: true },
      });
      req.userFunnelIds = u ? u.funnelAccess.map((f) => f.id) : [];
      req.userLocked = u ? u.locked : false;
      req.userCanExport = u ? u.canExport : true;
    }
    req.appConfig = await getConfig(req.tenantId);
    next();
  } catch (e) {
    next(e);
  }
});

const CONTACT_TYPES = ['INFLUENCER', 'PROMOTER'];
const CLOSURE_STAGE = 'closure';
const canDemote = (user) => user.role === 'SUPER_ADMIN' || user.role === 'MANAGER';
// Once a lead is Closed its stage is locked (only a Super Admin may correct it).
const stageLocked = (lead, user) => lead.stage === CLOSURE_STAGE && user.role !== 'SUPER_ADMIN';

// Stage helpers derived from the configured (ordered) stage list.
const stageList = (req) => (req.appConfig.stages || []);
const stageIds = (req) => stageList(req).map((s) => s.id);
const stageIndex = (req, id) => stageIds(req).indexOf(id);
const nextStageId = (req, id) => {
  const ids = stageIds(req);
  const i = ids.indexOf(id);
  return i >= 0 && i < ids.length - 1 ? ids[i + 1] : null;
};
const prevStageId = (req, id) => {
  const ids = stageIds(req);
  const i = ids.indexOf(id);
  return i > 0 ? ids[i - 1] : null;
};
const stageName = (req, id) => (stageList(req).find((s) => s.id === id) || {}).name || id;

// Blocks lead-mutating requests when the admin has enabled read-only mode.
function enforceWritable(req, res, next) {
  const cfg = req.appConfig;
  if (req.user.role === 'SUPER_ADMIN') return next();
  if (cfg && cfg.readOnly) return res.status(403).json({ error: 'The system is in read-only mode (set by the administrator).' });
  if (cfg && cfg.repsReadOnly && req.user.role === 'SALES_REP') {
    return res.status(403).json({ error: 'Sales reps are in view-only mode (set by the administrator).' });
  }
  if (req.userLocked) return res.status(403).json({ error: 'Your account is locked to view-only by the administrator.' });
  next();
}

const leadInclude = {
  funnel: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true, email: true } },
};

const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const MAX_LEAD_IMAGES = 8;
const imageMetaSelect = {
  id: true,
  filename: true,
  mimeType: true,
  createdAt: true,
  author: { select: { id: true, name: true } },
};

function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 4, 8) === 'ftyp' && /heic|heix|hevc|mif1/i.test(buf.toString('ascii', 8, 12))) return 'heic';
  return null;
}

// Normalize and validate a lead payload (shared by create/update).
function sanitizeLeadInput(body) {
  const out = {};
  if (body.schoolName !== undefined) out.schoolName = String(body.schoolName).trim();
  if (body.board !== undefined) out.board = body.board ? String(body.board).trim() : null;
  if (body.region !== undefined) out.region = body.region ? String(body.region).trim() : null;
  if (body.location !== undefined) out.location = body.location ? String(body.location).trim() : null;
  if (body.contactName !== undefined) out.contactName = body.contactName ? String(body.contactName).trim() : null;
  if (body.contactPhone !== undefined) out.contactPhone = body.contactPhone ? String(body.contactPhone).trim() : null;
  if (body.source !== undefined) out.source = body.source ? String(body.source).trim() : null;

  if (body.studentStrength !== undefined && body.studentStrength !== null && body.studentStrength !== '') {
    const n = parseInt(body.studentStrength, 10);
    if (Number.isNaN(n) || n < 0) throw new Error('studentStrength must be a non-negative number');
    out.studentStrength = n;
  } else if (body.studentStrength === null || body.studentStrength === '') {
    out.studentStrength = null;
  }

  if (body.contactType !== undefined && body.contactType !== null && body.contactType !== '') {
    if (!CONTACT_TYPES.includes(body.contactType)) throw new Error('Invalid contactType');
    out.contactType = body.contactType;
  } else if (body.contactType === null || body.contactType === '') {
    out.contactType = null;
  }

  if (body.stage !== undefined && body.stage !== null && body.stage !== '') {
    out.stage = String(body.stage);
  }

  if (body.funnelId !== undefined) {
    out.funnelId = body.funnelId ? parseInt(body.funnelId, 10) : null;
  }
  if (body.ownerId !== undefined) {
    out.ownerId = body.ownerId ? parseInt(body.ownerId, 10) : null;
  }

  const num = (v) => {
    if (v === null || v === '' || v === undefined) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.]/g, ''));
    return Number.isNaN(n) ? null : n;
  };
  if (body.totalContractValue !== undefined) {
    const n = num(body.totalContractValue);
    if (n !== null && n < 0) throw new Error('totalContractValue must be non-negative');
    out.totalContractValue = n;
  }
  if (body.pspmRate !== undefined) {
    const n = num(body.pspmRate);
    if (n !== null && n < 0) throw new Error('pspmRate must be non-negative');
    out.pspmRate = n;
  }
  if (body.cac !== undefined) {
    const n = num(body.cac);
    if (n !== null && n < 0) throw new Error('cac must be non-negative');
    out.cac = n;
  }
  if (body.leadDate !== undefined && body.leadDate) {
    const d = new Date(body.leadDate);
    if (Number.isNaN(d.getTime())) throw new Error('Invalid leadDate');
    out.leadDate = d;
  }
  if (body.reminderAt !== undefined) {
    if (!body.reminderAt) {
      out.reminderAt = null;
    } else {
      const d = new Date(body.reminderAt);
      if (Number.isNaN(d.getTime())) throw new Error('Invalid reminderAt');
      out.reminderAt = d;
    }
  }
  if (body.reminderNote !== undefined) out.reminderNote = body.reminderNote ? String(body.reminderNote).trim() : null;
  return out;
}

// Enforce mandatory fields for manual create/edit (import stays lenient).
function assertMandatory(lead) {
  const missing = [];
  if (!lead.schoolName) missing.push('School Name');
  if (lead.studentStrength === null || lead.studentStrength === undefined) missing.push('Student strength');
  if (!lead.contactName) missing.push('Contact name');
  if (!lead.funnelId) missing.push('Funnel');
  if (lead.totalContractValue === null || lead.totalContractValue === undefined) missing.push('Total Contract Value');
  if (missing.length) {
    const err = new Error(`Please fill required field(s): ${missing.join(', ')}`);
    err.status = 400;
    throw err;
  }
}

// Tenant + role/funnel/owner scope as a reusable `where` fragment.
function tenantScope(req) {
  return { AND: [{ tenantId: req.tenantId }, buildLeadScope(req.user, req.userFunnelIds)] };
}

// Ensure any funnelId/ownerId on a lead payload belongs to the caller's tenant.
async function funnelOwnerInTenant(req, input) {
  if (input.funnelId) {
    const f = await prisma.funnel.findFirst({ where: { id: input.funnelId, tenantId: req.tenantId }, select: { id: true } });
    if (!f) return false;
  }
  if (input.ownerId) {
    const o = await prisma.user.findFirst({ where: { id: input.ownerId, tenantId: req.tenantId }, select: { id: true } });
    if (!o) return false;
  }
  return true;
}

// Builds the Prisma `where` from scope + query filters (shared by list & export).
function buildLeadWhere(req) {
  const { region, stage, board, funnelId, ownerId, minStrength, maxStrength, search } = req.query;
  const where = { AND: [{ tenantId: req.tenantId }, buildLeadScope(req.user, req.userFunnelIds)] };
  if (region) where.AND.push({ region });
  if (stage && stageIds(req).includes(stage)) where.AND.push({ stage });
  if (board) where.AND.push({ board });
  if (funnelId) where.AND.push({ funnelId: parseInt(funnelId, 10) });
  if (ownerId) where.AND.push({ ownerId: parseInt(ownerId, 10) });
  if (minStrength) where.AND.push({ studentStrength: { gte: parseInt(minStrength, 10) } });
  if (maxStrength) {
    const existing = where.AND.find((c) => c.studentStrength);
    if (existing) existing.studentStrength.lte = parseInt(maxStrength, 10);
    else where.AND.push({ studentStrength: { lte: parseInt(maxStrength, 10) } });
  }
  if (req.query.reminderDue === 'true') where.AND.push({ reminderAt: { lte: new Date() } });
  // Lead-date window
  if (req.query.leadDateFrom) where.AND.push({ leadDate: { gte: new Date(req.query.leadDateFrom) } });
  if (req.query.leadDateTo) {
    const d = new Date(req.query.leadDateTo); d.setHours(23, 59, 59, 999);
    where.AND.push({ leadDate: { lte: d } });
  }
  // Ageing window (days since lead date): minAge => old enough, maxAge => recent enough
  const DAY = 86400000;
  if (req.query.minAge) where.AND.push({ leadDate: { lte: new Date(Date.now() - parseInt(req.query.minAge, 10) * DAY) } });
  if (req.query.maxAge) where.AND.push({ leadDate: { gte: new Date(Date.now() - parseInt(req.query.maxAge, 10) * DAY) } });
  if (search) {
    where.AND.push({
      OR: [
        { schoolName: { contains: String(search), mode: 'insensitive' } },
        { contactName: { contains: String(search), mode: 'insensitive' } },
        { location: { contains: String(search), mode: 'insensitive' } },
      ],
    });
  }
  return where;
}

// Header sort for the leads grid. Unknown keys fall back to recently updated.
const LEAD_SORTS = {
  schoolName: (dir) => ({ schoolName: dir }),
  board: (dir) => ({ board: dir }),
  studentStrength: (dir) => ({ studentStrength: dir }),
  totalContractValue: (dir) => ({ totalContractValue: dir }),
  cac: (dir) => ({ cac: dir }),
  // Fewer ageing days means a later lead date.
  ageing: (dir) => ({ leadDate: dir === 'asc' ? 'desc' : 'asc' }),
  reminder: (dir) => ({ reminderAt: dir }),
  region: (dir) => ({ region: dir }),
  contact: (dir) => ({ contactName: dir }),
  funnel: (dir) => ({ funnel: { name: dir } }),
  owner: (dir) => ({ owner: { name: dir } }),
  stage: (dir) => ({ stage: dir }),
};

function leadOrderBy(query) {
  const key = String((query && query.sort) || '');
  const dir = query && (query.order === 'ascend' || query.order === 'asc')
    ? 'asc'
    : query && (query.order === 'descend' || query.order === 'desc')
      ? 'desc'
      : null;
  if (!dir || !LEAD_SORTS[key]) return [{ updatedAt: 'desc' }, { id: 'desc' }];
  return [LEAD_SORTS[key](dir), { id: 'asc' }];
}

// GET /api/leads  — leads pool with filters + pagination
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
  const where = buildLeadWhere(req);

  const [total, data] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      include: leadInclude,
      orderBy: leadOrderBy(req.query),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({ data, total, page, pageSize });
});

// GET /api/leads/filters — distinct values to populate filter dropdowns
router.get('/filters', async (req, res) => {
  const where = tenantScope(req);
  const [regions, boards] = await Promise.all([
    prisma.lead.findMany({ where, distinct: ['region'], select: { region: true } }),
    prisma.lead.findMany({ where, distinct: ['board'], select: { board: true } }),
  ]);
  res.json({
    regions: regions.map((r) => r.region).filter(Boolean).sort(),
    boards: boards.map((b) => b.board).filter(Boolean).sort(),
    stages: stageIds(req),
    contactTypes: CONTACT_TYPES,
  });
});

// GET /api/leads/export — download the (scoped, filtered) leads as XLSX. Gated by admin export toggle.
router.get('/export', async (req, res) => {
  if (!req.appConfig.exportEnabled) {
    return res.status(403).json({ error: 'Export is turned off by the administrator.' });
  }
  if (!req.userCanExport) {
    return res.status(403).json({ error: 'Your account is not allowed to export or print.' });
  }
  const where = buildLeadWhere(req);
  const leads = await prisma.lead.findMany({ where, include: leadInclude, orderBy: leadOrderBy(req.query) });
  const CONTACT_LABEL = { INFLUENCER: 'Influencer', PROMOTER: 'School Promoter' };
  const rows = leads.map((l, i) => ({
    '#': i + 1,
    'School': l.schoolName,
    'Board': l.board || '',
    'Students': l.studentStrength ?? '',
    'Stage': stageName(req, l.stage),
    'Funnel': l.funnel ? l.funnel.name : '',
    'Owner': l.owner ? l.owner.name : '',
    'Region': l.region || '',
    'Location': l.location || '',
    'Contact': l.contactName || '',
    'Contact Type': l.contactType ? CONTACT_LABEL[l.contactType] : '',
    'Contact Phone': l.contactPhone || '',
    'Total Contract Value': l.totalContractValue ?? '',
    'PSPM Rate': l.pspmRate ?? '',
    'CAC': l.cac ?? '',
    'Lead Date': l.leadDate ? l.leadDate.toISOString().slice(0, 10) : '',
    'Reminder': l.reminderAt ? l.reminderAt.toISOString().slice(0, 10) : '',
    'Source': l.source || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="leads-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// GET /api/leads/stats — per-funnel lead counts, stage breakdown and TCV (scoped to the user).
router.get('/stats', async (req, res) => {
  const scope = tenantScope(req);
  const grouped = await prisma.lead.groupBy({
    by: ['funnelId', 'stage'],
    where: scope,
    _count: { _all: true },
    _sum: { totalContractValue: true },
  });

  // Funnels to show: the user's assigned funnels, else all funnels (admins/managers),
  // and always any funnel that has leads in scope.
  const allFunnels = await prisma.funnel.findMany({ where: { tenantId: req.tenantId }, select: { id: true, name: true } });
  const nameById = Object.fromEntries(allFunnels.map((f) => [f.id, f.name]));

  const map = new Map();
  const ensure = (id) => {
    if (!map.has(id)) {
      map.set(id, { id, name: id === null ? 'Unassigned' : (nameById[id] || `Funnel ${id}`), total: 0, totalTCV: 0, byStage: {} });
    }
    return map.get(id);
  };
  // Seed the user's assigned funnels so an empty-but-assigned funnel still appears.
  if (Array.isArray(req.userFunnelIds)) req.userFunnelIds.forEach((id) => ensure(id));
  for (const row of grouped) {
    const f = ensure(row.funnelId);
    f.total += row._count._all;
    f.totalTCV += row._sum.totalContractValue || 0;
    f.byStage[row.stage] = (f.byStage[row.stage] || 0) + row._count._all;
  }
  res.json({ funnels: Array.from(map.values()) });
});

// GET /api/leads/:id
router.get('/:id', async (req, res) => {
  const lead = await prisma.lead.findFirst({
    where: { id: parseInt(req.params.id, 10), tenantId: req.tenantId },
    include: {
      ...leadInclude,
      history: {
        orderBy: { changedAt: 'desc' },
        include: { changedBy: { select: { id: true, name: true } } },
      },
      notes: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true } } },
      },
      images: {
        orderBy: { createdAt: 'desc' },
        select: imageMetaSelect,
      },
    },
  });
  if (!lead) return res.status(404).json({ error: 'Not found' });
  if (!canViewLead(req.user, lead, req.userFunnelIds)) return res.status(403).json({ error: 'Forbidden' });
  res.json({ lead });
});

// POST /api/leads/:id/notes — append a remark. { body }
router.post('/:id/notes', enforceWritable, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const body = String((req.body && req.body.body) || '').trim();
  if (!body) return res.status(400).json({ error: 'Write a note before saving' });
  if (body.length > 4000) return res.status(400).json({ error: 'Note is too long (max 4000 characters)' });

  const lead = await prisma.lead.findFirst({ where: { id, tenantId: req.tenantId } });
  if (!lead) return res.status(404).json({ error: 'Not found' });
  if (!canEditLead(req.user, lead, req.userFunnelIds)) return res.status(403).json({ error: 'Forbidden' });

  const note = await prisma.leadNote.create({
    data: { tenantId: req.tenantId, leadId: id, body, authorId: req.user.id },
    include: { author: { select: { id: true, name: true } } },
  });
  res.status(201).json({ note });
});

// POST /api/leads/:id/images — attach one photo. multipart field "file".
router.post('/:id/images', enforceWritable, imageUpload.single('file'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!req.file) return res.status(400).json({ error: 'Choose an image to attach' });
  const mimeType = sniffImage(req.file.buffer);
  if (mimeType === 'heic') {
    return res.status(400).json({ error: 'This photo is HEIC. Save it as a JPEG, or set the camera to Most Compatible.' });
  }
  if (!mimeType) return res.status(400).json({ error: 'Attach a JPEG, PNG, WEBP, or GIF image' });

  const lead = await prisma.lead.findFirst({ where: { id, tenantId: req.tenantId } });
  if (!lead) return res.status(404).json({ error: 'Not found' });
  if (!canEditLead(req.user, lead, req.userFunnelIds)) return res.status(403).json({ error: 'Forbidden' });

  const count = await prisma.leadImage.count({ where: { leadId: id, tenantId: req.tenantId } });
  if (count >= MAX_LEAD_IMAGES) {
    return res.status(400).json({ error: `A lead can have up to ${MAX_LEAD_IMAGES} images` });
  }

  const filename = String(req.file.originalname || 'photo').split(/[/\\]/).pop().slice(0, 120) || 'photo';
  const image = await prisma.leadImage.create({
    data: {
      tenantId: req.tenantId,
      leadId: id,
      filename,
      mimeType,
      data: req.file.buffer,
      authorId: req.user.id,
    },
    select: imageMetaSelect,
  });
  res.status(201).json({ image });
});

// GET /api/leads/:id/images/:imageId — the image bytes, for someone who can see the lead.
router.get('/:id/images/:imageId', async (req, res) => {
  const leadId = parseInt(req.params.id, 10);
  const imageId = parseInt(req.params.imageId, 10);
  const lead = await prisma.lead.findFirst({ where: { id: leadId, tenantId: req.tenantId } });
  if (!lead) return res.status(404).json({ error: 'Not found' });
  if (!canViewLead(req.user, lead, req.userFunnelIds)) return res.status(403).json({ error: 'Forbidden' });

  const image = await prisma.leadImage.findFirst({
    where: { id: imageId, leadId, tenantId: req.tenantId },
  });
  if (!image) return res.status(404).json({ error: 'Not found' });
  res.set('Content-Type', image.mimeType);
  res.set('Cache-Control', 'private, max-age=300');
  res.send(Buffer.from(image.data));
});

// DELETE /api/leads/:id/images/:imageId
router.delete('/:id/images/:imageId', enforceWritable, async (req, res) => {
  const leadId = parseInt(req.params.id, 10);
  const imageId = parseInt(req.params.imageId, 10);
  const lead = await prisma.lead.findFirst({ where: { id: leadId, tenantId: req.tenantId } });
  if (!lead) return res.status(404).json({ error: 'Not found' });
  if (!canEditLead(req.user, lead, req.userFunnelIds)) return res.status(403).json({ error: 'Forbidden' });

  const removed = await prisma.leadImage.deleteMany({
    where: { id: imageId, leadId, tenantId: req.tenantId },
  });
  if (!removed.count) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// POST /api/leads — create a lead manually (1:1)
router.post('/', enforceWritable, async (req, res) => {
  let input;
  try {
    input = sanitizeLeadInput(req.body || {});
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  if (!input.schoolName) return res.status(400).json({ error: 'schoolName is required' });
  if (input.stage && !stageIds(req).includes(input.stage)) {
    return res.status(400).json({ error: 'Invalid stage' });
  }

  // Reps may only create leads owned by themselves.
  if (req.user.role === 'SALES_REP') {
    input.ownerId = req.user.id;
    if (req.user.region) input.region = input.region || req.user.region;
  }
  try {
    assertMandatory(input);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  // Funnel-scoped users may only file leads under a funnel they can access.
  if (req.userFunnelIds && req.userFunnelIds.length && !req.userFunnelIds.includes(input.funnelId)) {
    return res.status(403).json({ error: 'You can only use a funnel assigned to you' });
  }
  if (!(await funnelOwnerInTenant(req, input))) return res.status(400).json({ error: 'Invalid funnel or owner for this client' });
  const stage = input.stage || stageIds(req)[0];

  const lead = await prisma.lead.create({
    data: {
      ...input,
      tenantId: req.tenantId,
      stage,
      closedAt: stage === CLOSURE_STAGE ? new Date() : undefined,
      history: { create: { tenantId: req.tenantId, toStage: stage, note: 'Lead created', changedById: req.user.id } },
    },
    include: leadInclude,
  });
  res.status(201).json({ lead });
});

// PUT /api/leads/:id — update lead fields
router.put('/:id', enforceWritable, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const lead = await prisma.lead.findFirst({ where: { id, tenantId: req.tenantId } });
  if (!lead) return res.status(404).json({ error: 'Not found' });
  if (!canEditLead(req.user, lead, req.userFunnelIds)) return res.status(403).json({ error: 'Forbidden' });

  let input;
  try {
    input = sanitizeLeadInput(req.body || {});
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  // Stage changes go through the dedicated endpoint so history is recorded.
  delete input.stage;
  // Reps cannot reassign ownership away from themselves.
  if (req.user.role === 'SALES_REP') delete input.ownerId;
  // Funnel-scoped users cannot move a lead into a funnel they can't access.
  if (req.userFunnelIds && req.userFunnelIds.length && input.funnelId !== undefined && !req.userFunnelIds.includes(input.funnelId)) {
    return res.status(403).json({ error: 'You can only use a funnel assigned to you' });
  }

  if (!(await funnelOwnerInTenant(req, input))) return res.status(400).json({ error: 'Invalid funnel or owner for this client' });

  // Validate the resulting lead (existing values merged with the edits).
  try {
    assertMandatory({ ...lead, ...input });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const updated = await prisma.lead.update({ where: { id }, data: input, include: leadInclude });
  res.json({ lead: updated });
});

// POST /api/leads/:id/stage — change stage (records history). { toStage, note }
router.post('/:id/stage', enforceWritable, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { toStage, note } = req.body || {};
  if (!stageIds(req).includes(toStage)) return res.status(400).json({ error: 'Invalid toStage' });

  const lead = await prisma.lead.findFirst({ where: { id, tenantId: req.tenantId } });
  if (!lead) return res.status(404).json({ error: 'Not found' });
  if (!canEditLead(req.user, lead, req.userFunnelIds)) return res.status(403).json({ error: 'Forbidden' });
  if (stageLocked(lead, req.user)) return res.status(403).json({ error: 'This lead is closed; its stage can no longer be changed.' });
  if (lead.stage === toStage) return res.status(400).json({ error: `Lead is already at ${stageName(req, toStage)}` });
  // Moving a lead to an earlier stage is a privileged correction (admin/manager only).
  if (stageIndex(req, toStage) < stageIndex(req, lead.stage) && !canDemote(req.user)) {
    return res.status(403).json({ error: 'Only an admin or manager can move a lead back to an earlier stage' });
  }

  const closedAt = toStage === CLOSURE_STAGE ? new Date() : (lead.stage === CLOSURE_STAGE ? null : undefined);
  const [updated] = await prisma.$transaction([
    prisma.lead.update({ where: { id }, data: { stage: toStage, closedAt }, include: leadInclude }),
    prisma.leadStageHistory.create({
      data: { tenantId: req.tenantId, leadId: id, fromStage: lead.stage, toStage, note: note || null, changedById: req.user.id },
    }),
  ]);
  res.json({ lead: updated });
});

// POST /api/leads/:id/promote — move to the next stage. { note }
router.post('/:id/promote', enforceWritable, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const lead = await prisma.lead.findFirst({ where: { id, tenantId: req.tenantId } });
  if (!lead) return res.status(404).json({ error: 'Not found' });
  if (!canEditLead(req.user, lead, req.userFunnelIds)) return res.status(403).json({ error: 'Forbidden' });
  if (stageLocked(lead, req.user)) return res.status(403).json({ error: 'This lead is closed; its stage can no longer be changed.' });

  const to = nextStageId(req, lead.stage);
  if (!to) return res.status(400).json({ error: 'Lead is already at the final stage' });

  const [updated] = await prisma.$transaction([
    prisma.lead.update({ where: { id }, data: { stage: to, closedAt: to === CLOSURE_STAGE ? new Date() : undefined }, include: leadInclude }),
    prisma.leadStageHistory.create({
      data: { tenantId: req.tenantId, leadId: id, fromStage: lead.stage, toStage: to, note: (req.body && req.body.note) || null, changedById: req.user.id },
    }),
  ]);
  res.json({ lead: updated });
});

// POST /api/leads/:id/demote — move to the previous stage. Admin/Manager only. { note }
router.post('/:id/demote', enforceWritable, async (req, res) => {
  if (!canDemote(req.user)) {
    return res.status(403).json({ error: 'Only an admin or manager can move a lead back' });
  }
  const id = parseInt(req.params.id, 10);
  const lead = await prisma.lead.findFirst({ where: { id, tenantId: req.tenantId } });
  if (!lead) return res.status(404).json({ error: 'Not found' });
  if (!canEditLead(req.user, lead, req.userFunnelIds)) return res.status(403).json({ error: 'Forbidden' });
  if (stageLocked(lead, req.user)) return res.status(403).json({ error: 'This lead is closed; its stage can no longer be changed.' });

  const to = prevStageId(req, lead.stage);
  if (!to) return res.status(400).json({ error: 'Lead is already at the first stage' });

  const [updated] = await prisma.$transaction([
    prisma.lead.update({ where: { id }, data: { stage: to, closedAt: lead.stage === CLOSURE_STAGE ? null : undefined }, include: leadInclude }),
    prisma.leadStageHistory.create({
      data: { tenantId: req.tenantId, leadId: id, fromStage: lead.stage, toStage: to, note: (req.body && req.body.note) || null, changedById: req.user.id },
    }),
  ]);
  res.json({ lead: updated });
});

// DELETE /api/leads/:id
router.delete('/:id', enforceWritable, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const lead = await prisma.lead.findFirst({ where: { id, tenantId: req.tenantId } });
  if (!lead) return res.status(404).json({ error: 'Not found' });
  if (!canDeleteLead(req.user, lead, req.userFunnelIds)) return res.status(403).json({ error: 'Forbidden' });
  await prisma.lead.delete({ where: { id } });
  res.json({ ok: true });
});

/* ----------------------------- Purchase Orders ---------------------------- */

const BILLING_CYCLES = ['MONTHLY', 'QUARTERLY'];
const VALUE_TYPES = ['PSPM', 'LUMPSUM'];

// Load the lead and check the caller may act on it.
async function loadLeadForPo(req, res, { write }) {
  const id = parseInt(req.params.id, 10);
  const lead = await prisma.lead.findFirst({ where: { id, tenantId: req.tenantId }, include: leadInclude });
  if (!lead) { res.status(404).json({ error: 'Not found' }); return null; }
  const ok = write ? canEditLead(req.user, lead, req.userFunnelIds) : canViewLead(req.user, lead, req.userFunnelIds);
  if (!ok) { res.status(403).json({ error: 'Forbidden' }); return null; }
  return lead;
}

function computeAmounts(body) {
  const num = (v) => { const n = parseFloat(v); return Number.isNaN(n) ? 0 : n; };
  const valueType = VALUE_TYPES.includes(body.valueType) ? body.valueType : 'LUMPSUM';
  let perStudentRate = null; let studentStrength = null; let monthlyAmount = null; let base = 0;
  if (valueType === 'PSPM') {
    perStudentRate = num(body.perStudentRate);
    studentStrength = parseInt(body.studentStrength, 10) || 0;
    base = perStudentRate * studentStrength;
  } else {
    monthlyAmount = num(body.monthlyAmount);
    base = monthlyAmount;
  }
  const gstPercent = 18;
  const gstAmount = Math.round(base * gstPercent) / 100;
  return { valueType, perStudentRate, studentStrength, monthlyAmount, baseAmount: base, gstPercent, gstAmount, grandTotal: base + gstAmount };
}

// GET /api/leads/:id/po — fetch the saved PO (or null).
router.get('/:id/po', async (req, res) => {
  const lead = await loadLeadForPo(req, res, { write: false });
  if (!lead) return;
  const po = await prisma.purchaseOrder.findUnique({ where: { leadId: lead.id } });
  res.json({ po });
});

// POST /api/leads/:id/po — create or update the PO for a lead.
router.post('/:id/po', enforceWritable, async (req, res) => {
  const lead = await loadLeadForPo(req, res, { write: true });
  if (!lead) return;
  const b = req.body || {};

  const schoolName = (b.schoolName || lead.schoolName || '').trim();
  if (!schoolName) return res.status(400).json({ error: 'School name is required' });
  if (!b.dealDate) return res.status(400).json({ error: 'Deal date is required' });
  const contacts = (Array.isArray(b.contacts) ? b.contacts : [])
    .map((c) => ({ name: (c.name || '').trim(), email: (c.email || '').trim(), phone: (c.phone || '').trim() }))
    .filter((c) => c.name || c.phone || c.email);
  if (!contacts.length) return res.status(400).json({ error: 'Add at least one point of contact' });
  for (const c of contacts) {
    if (!c.name || !c.phone) return res.status(400).json({ error: 'Each contact needs a name and phone number' });
  }

  const amounts = computeAmounts(b);
  const existing = await prisma.purchaseOrder.findUnique({ where: { leadId: lead.id } });
  const template = effectivePoTemplate(req.appConfig);
  const poNumber = existing ? existing.poNumber
    : `${template.numberPrefix || 'PO'}/${new Date().getFullYear()}/${String(lead.id).padStart(4, '0')}`;

  const data = {
    poNumber,
    dealDate: new Date(b.dealDate),
    contractExpiry: b.contractExpiry ? new Date(b.contractExpiry) : null,
    ...amounts,
    billingCycle: BILLING_CYCLES.includes(b.billingCycle) ? b.billingCycle : 'MONTHLY',
    schoolName,
    addresseeTitle: b.addresseeTitle || null,
    board: (b.board || lead.board || null),
    contacts,
    createdById: req.user.id,
  };

  const po = await prisma.purchaseOrder.upsert({
    where: { leadId: lead.id },
    create: { tenantId: req.tenantId, leadId: lead.id, ...data },
    update: data,
  });
  res.status(existing ? 200 : 201).json({ po });
});

// GET /api/leads/:id/po/document?format=pdf|docx — generate & stream the PO.
router.get('/:id/po/document', async (req, res) => {
  const lead = await loadLeadForPo(req, res, { write: false });
  if (!lead) return;
  const po = await prisma.purchaseOrder.findUnique({ where: { leadId: lead.id } });
  if (!po) return res.status(404).json({ error: 'No purchase order saved for this lead yet' });

  const template = effectivePoTemplate(req.appConfig);
  template.logo = req.appConfig.logo || null;
  const vm = buildViewModel(po, template);
  const safeName = String(po.schoolName).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'purchase-order';
  const format = req.query.format === 'docx' ? 'docx' : 'pdf';

  try {
    if (format === 'docx') {
      const buf = await generateDocx(vm);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="PO-${safeName}.docx"`);
      return res.send(buf);
    }
    const buf = await generatePdf(vm);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PO-${safeName}.pdf"`);
    return res.send(buf);
  } catch (e) {
    console.error('PO generation failed', e);
    return res.status(500).json({ error: 'Could not generate the document' });
  }
});

module.exports = router;
