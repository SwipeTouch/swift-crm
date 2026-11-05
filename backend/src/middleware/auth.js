const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-change-me';

function signToken(user, tenant) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      region: user.region || null,
      name: user.name,
      tenantId: user.tenantId,
      tenantCode: tenant ? tenant.code : undefined,
      tenantName: tenant ? tenant.name : undefined,
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

// Verifies the JWT and attaches the decoded payload to req.user.
// req.tenantId is the single source of truth for tenant scoping.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    if (!req.user.tenantId) return res.status(401).json({ error: 'Invalid or expired token' });
    req.tenantId = req.user.tenantId;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Restricts a route to the given roles.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { signToken, requireAuth, requireRole, JWT_SECRET };
