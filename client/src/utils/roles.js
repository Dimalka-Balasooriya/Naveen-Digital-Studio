export function normalizeRole(role) {
  const value = String(role || '').toUpperCase();
  if (value === 'ADMIN') return 'OWNER';
  if (value === 'PRODUCTION') return 'PRODUCTION_EMPLOYEE';
  return value;
}

export function isAdminRole(role) {
  return ['OWNER', 'CO_ADMIN'].includes(normalizeRole(role));
}

export function isOwner(role) {
  return normalizeRole(role) === 'OWNER';
}
