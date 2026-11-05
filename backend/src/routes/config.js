const express = require('express');
const multer = require('multer');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getConfig, ALL_COLUMN_KEYS, effectivePoTemplate } = require('../lib/config');

const router = express.Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'stage';

// GET /api/config — any authenticated user (frontend needs stages, colors, flags).
router.get('/', async (req, res) => {
  const cfg = await getConfig(req.tenantId);
  res.json({ config: { ...cfg, poTemplate: effectivePoTemplate(cfg) } });
});

// POST /api/config/logo — upload the company logo (stored as a base64 data URL). Super Admin only.
router.post('/logo', requireRole('SUPER_ADMIN'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name "file")' });
  const type = req.file.mimetype || 'image/png';
  if (!/^image\//.test(type)) return res.status(400).json({ error: 'Logo must be an image' });
  const dataUrl = `data:${type};base64,${req.file.buffer.toString('base64')}`;
  await getConfig(req.tenantId);
  const cfg = await prisma.appConfig.update({ where: { tenantId: req.tenantId }, data: { logo: dataUrl } });
  res.json({ ok: true, logo: cfg.logo });
});

// PUT /api/config — Super Admin only.
router.put('/', requireRole('SUPER_ADMIN'), async (req, res) => {
  const body = req.body || {};
  const data = {};

  if (body.stages !== undefined) {
    if (!Array.isArray(body.stages) || body.stages.length === 0) {
      return res.status(400).json({ error: 'At least one stage is required' });
    }
    const seen = new Set();
    const stages = [];
    for (const s of body.stages) {
      const name = (s && s.name ? String(s.name) : '').trim();
      if (!name) return res.status(400).json({ error: 'Every stage needs a name' });
      let id = s.id ? slugify(s.id) : slugify(name);
      while (seen.has(id)) id = `${id}-x`;
      seen.add(id);
      const color = s.color && /^#[0-9a-fA-F]{3,8}$/.test(s.color) ? s.color : '#8c8c8c';
      stages.push({ id, name, color });
    }
    // Don't allow removing a stage that leads currently sit in.
    const inUse = await prisma.lead.findMany({ where: { tenantId: req.tenantId }, distinct: ['stage'], select: { stage: true } });
    const incoming = new Set(stages.map((s) => s.id));
    const orphaned = inUse.map((l) => l.stage).filter((st) => st && !incoming.has(st));
    if (orphaned.length) {
      return res.status(400).json({
        error: `Cannot remove stage(s) still used by leads: ${orphaned.join(', ')}. Move those leads to another stage first.`,
      });
    }
    data.stages = stages;
  }

  if (body.repColumns !== undefined) {
    if (!Array.isArray(body.repColumns)) return res.status(400).json({ error: 'repColumns must be a list' });
    data.repColumns = body.repColumns.filter((k) => ALL_COLUMN_KEYS.includes(k));
  }

  if (body.ageingThresholdDays !== undefined) {
    const n = parseInt(body.ageingThresholdDays, 10);
    if (Number.isNaN(n) || n < 1) return res.status(400).json({ error: 'Ageing threshold must be a positive number of days' });
    data.ageingThresholdDays = n;
  }
  if (body.exportEnabled !== undefined) data.exportEnabled = !!body.exportEnabled;
  if (body.readOnly !== undefined) data.readOnly = !!body.readOnly;
  if (body.repsReadOnly !== undefined) data.repsReadOnly = !!body.repsReadOnly;

  const current = await getConfig(req.tenantId); // ensure the row exists before updating
  if (body.poTemplate && typeof body.poTemplate === 'object') {
    data.poTemplate = { ...(current.poTemplate || {}), ...body.poTemplate };
  }
  const cfg = await prisma.appConfig.update({ where: { tenantId: req.tenantId }, data });
  res.json({ config: { ...cfg, poTemplate: effectivePoTemplate(cfg) } });
});

module.exports = router;
