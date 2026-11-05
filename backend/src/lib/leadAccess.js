// Row-level access rules for leads.
//
//   SUPER_ADMIN                 -> all leads
//   user WITH assigned funnels  -> leads in those funnels (overrides role scope)
//   MANAGER (region set)        -> leads in their region
//   MANAGER (no region)         -> all leads
//   SALES_REP                   -> only leads they own
//
// `funnelIds` is the set of funnels a user has been granted access to
// (null for Super Admin, [] for a user with none). It takes precedence
// over the region/owner scoping when non-empty.
function buildLeadScope(user, funnelIds) {
  if (user.role === 'SUPER_ADMIN') return {};
  if (funnelIds && funnelIds.length) return { funnelId: { in: funnelIds } };
  if (user.role === 'MANAGER') return user.region ? { region: user.region } : {};
  return { ownerId: user.id };
}

function canViewLead(user, lead, funnelIds) {
  if (user.role === 'SUPER_ADMIN') return true;
  if (funnelIds && funnelIds.length) return funnelIds.includes(lead.funnelId);
  if (user.role === 'MANAGER') return !user.region || lead.region === user.region;
  return lead.ownerId === user.id;
}

function canEditLead(user, lead, funnelIds) {
  return canViewLead(user, lead, funnelIds);
}

// Only Super Admin and Manager may delete leads (within their scope).
function canDeleteLead(user, lead, funnelIds) {
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'MANAGER') {
    if (funnelIds && funnelIds.length) return funnelIds.includes(lead.funnelId);
    return !user.region || lead.region === user.region;
  }
  return false;
}

module.exports = { buildLeadScope, canViewLead, canEditLead, canDeleteLead };
