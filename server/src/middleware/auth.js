import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';

export function normalizeRole(role) {
  const value = String(role || '').toUpperCase();
  if (value === 'ADMIN') return 'OWNER';
  if (value === 'PRODUCTION') return 'PRODUCTION_EMPLOYEE';
  return value;
}

const roleAliases = {
  admin: ['OWNER', 'CO_ADMIN'],
  production: ['PRODUCTION_EMPLOYEE'],
  OWNER: ['OWNER'],
  CO_ADMIN: ['CO_ADMIN'],
  PRODUCTION_EMPLOYEE: ['PRODUCTION_EMPLOYEE']
};

function expandRoles(roles) {
  return roles.flatMap((role) => roleAliases[role] || [normalizeRole(role)]);
}

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token || null;

    if (!token) {
      return res.status(401).json({ message: 'Authentication token is required.' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const users = await query(
      `SELECT e.id, e.name, e.email, e.phone, e.is_active, r.name AS role
       FROM employees e
       JOIN roles r ON r.id = e.role_id
       WHERE e.id = :id`,
      { id: payload.id }
    );

    if (!users.length || !users[0].is_active) {
      return res.status(401).json({ message: 'User is inactive or no longer exists.' });
    }

    req.user = { ...users[0], role: normalizeRole(users[0].role), raw_role: users[0].role };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    const allowed = expandRoles(roles);
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

export const requireOwner = requireRole('OWNER');
export const requireAdminOrCoAdmin = requireRole('OWNER', 'CO_ADMIN');
export const requireProductionOrAdmin = requireRole('OWNER', 'CO_ADMIN', 'PRODUCTION_EMPLOYEE');
