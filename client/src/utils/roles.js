export function normalizeRole(role) {
  const value = String(role || '').toUpperCase();
  if (value === 'ADMIN') return 'OWNER';
  if (value === 'PRODUCTION') return 'PRODUCTION_EMPLOYEE';
  if (value === 'DESIGN') return 'DESIGN_TEAM';
  return value;
}

export function isAdminRole(role) {
  return ['OWNER', 'CO_ADMIN'].includes(normalizeRole(role));
}

export function isOwner(role) {
  return normalizeRole(role) === 'OWNER';
}

export function isCoAdmin(role) {
  return normalizeRole(role) === 'CO_ADMIN';
}

export function isWorkerRole(role) {
  return ['PRODUCTION_EMPLOYEE', 'DESIGN_TEAM'].includes(normalizeRole(role));
}
