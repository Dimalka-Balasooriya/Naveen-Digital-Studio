import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../config/db.js';
import { authenticate, requireAdminOrCoAdmin } from '../middleware/auth.js';

const router = Router();

const employeeSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  role: z.enum(['OWNER', 'CO_ADMIN', 'PRODUCTION_EMPLOYEE', 'admin', 'production']),
  password: z.string().min(6).optional(),
  is_active: z.boolean().optional()
});

let hasCheckedEmployeeColumns = false;

async function ensureEmployeeColumns() {
  if (hasCheckedEmployeeColumns) return;

  const deletedAtRows = await query(
    `SELECT COUNT(*) AS column_count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'employees'
       AND COLUMN_NAME = 'deleted_at'`
  );

  if (!Number(deletedAtRows[0]?.column_count || 0)) {
    await query('ALTER TABLE employees ADD COLUMN deleted_at TIMESTAMP NULL AFTER is_active');
  }

  const addressRows = await query(
    `SELECT COUNT(*) AS column_count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'employees'
       AND COLUMN_NAME = 'address'`
  );

  if (!Number(addressRows[0]?.column_count || 0)) {
    await query('ALTER TABLE employees ADD COLUMN address TEXT NULL AFTER phone');
  }

  hasCheckedEmployeeColumns = true;
}

router.get('/', authenticate, requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    await ensureEmployeeColumns();
    const employees = await query(
      `SELECT e.id, e.name, e.email, e.phone, e.address, e.is_active, e.created_at, r.name AS role,
        COUNT(o.id) AS assigned_orders,
        SUM(LOWER(s.name) IN ('complete', 'completed')) AS completed_orders
       FROM employees e
       JOIN roles r ON r.id = e.role_id
       LEFT JOIN orders o ON o.assigned_employee_id = e.id
       LEFT JOIN order_statuses s ON s.id = o.status_id
       WHERE r.name <> 'OWNER' AND e.deleted_at IS NULL
       GROUP BY e.id, r.name
       ORDER BY e.name`
    );
    res.json(employees);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    await ensureEmployeeColumns();
    const body = employeeSchema.extend({ password: z.string().min(6) }).parse(req.body);
    if (body.role === 'OWNER') {
      return res.status(403).json({ message: 'The owner account is managed separately.' });
    }
    const roles = await query('SELECT id FROM roles WHERE name = :role', { role: body.role });
    if (!roles.length) return res.status(400).json({ message: 'Selected role is not available in the database.' });
    const password_hash = await bcrypt.hash(body.password, 10);
    const existingEmail = await query(
      'SELECT id, deleted_at FROM employees WHERE email = :email LIMIT 1',
      { email: body.email }
    );
    if (existingEmail.length && !existingEmail[0].deleted_at) {
      return res.status(409).json({ message: 'This email already exists. Use another email address.' });
    }
    if (existingEmail.length && existingEmail[0].deleted_at) {
      await query(
        `UPDATE employees
         SET role_id = :role_id,
             name = :name,
             phone = :phone,
             address = :address,
             password_hash = :password_hash,
             is_active = :is_active,
             deleted_at = NULL
         WHERE id = :id`,
        {
          id: existingEmail[0].id,
          role_id: roles[0].id,
          name: body.name,
          phone: body.phone || null,
          address: body.address || null,
          password_hash,
          is_active: body.is_active ?? true
        }
      );
      const restoredRows = await query(
        `SELECT e.id, e.name, e.email, e.phone, e.address, e.is_active, r.name AS role
         FROM employees e JOIN roles r ON r.id = e.role_id
         WHERE e.id = :id`,
        { id: existingEmail[0].id }
      );
      return res.status(201).json(restoredRows[0]);
    }
    const result = await query(
      `INSERT INTO employees (role_id, name, email, phone, address, password_hash, is_active)
       VALUES (:role_id, :name, :email, :phone, :address, :password_hash, :is_active)`,
      {
        role_id: roles[0].id,
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        address: body.address || null,
        password_hash,
        is_active: body.is_active ?? true
      }
    );
    const rows = await query(
      `SELECT e.id, e.name, e.email, e.phone, e.address, e.is_active, r.name AS role
       FROM employees e JOIN roles r ON r.id = e.role_id
       WHERE e.id = :id`,
      { id: result.insertId }
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    await ensureEmployeeColumns();
    const body = employeeSchema.partial().parse(req.body);
    const target = await query(
      `SELECT e.id, e.deleted_at, r.name AS role
       FROM employees e JOIN roles r ON r.id = e.role_id
       WHERE e.id = :id`,
      { id: req.params.id }
    );
    if (!target.length) return res.status(404).json({ message: 'Employee not found.' });
    const targetRole = String(target[0].role).toUpperCase();
    if (target[0].deleted_at) return res.status(404).json({ message: 'Employee not found.' });
    if (targetRole === 'OWNER') {
      return res.status(403).json({ message: 'The owner account cannot be managed from Employees.' });
    }
    if (body.role === 'OWNER') {
      return res.status(403).json({ message: 'The owner account is managed separately.' });
    }
    const updates = { ...body };
    delete updates.role;
    delete updates.password;

    if (body.role) {
      const roles = await query('SELECT id FROM roles WHERE name = :role', { role: body.role });
      if (!roles.length) return res.status(400).json({ message: 'Selected role is not available in the database.' });
      updates.role_id = roles[0].id;
    }

    if (body.password) {
      updates.password_hash = await bcrypt.hash(body.password, 10);
    }

    const keys = Object.keys(updates);
    if (!keys.length) return res.status(400).json({ message: 'No fields supplied.' });

    await query(
      `UPDATE employees SET ${keys.map((key) => `${key} = :${key}`).join(', ')} WHERE id = :id`,
      { ...updates, id: req.params.id }
    );
    const rows = await query(
      `SELECT e.id, e.name, e.email, e.phone, e.address, e.is_active, r.name AS role
       FROM employees e JOIN roles r ON r.id = e.role_id
       WHERE e.id = :id`,
      { id: req.params.id }
    );
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', authenticate, requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    await ensureEmployeeColumns();
    const body = z.object({ is_active: z.boolean() }).parse(req.body);
    const target = await query(
      `SELECT e.id, e.deleted_at, r.name AS role
       FROM employees e JOIN roles r ON r.id = e.role_id
       WHERE e.id = :id`,
      { id: req.params.id }
    );
    if (!target.length || target[0].deleted_at) return res.status(404).json({ message: 'Employee not found.' });

    const targetRole = String(target[0].role || '').toUpperCase();
    if (targetRole === 'OWNER') {
      return res.status(403).json({ message: 'The owner account cannot be deactivated.' });
    }
    await query('UPDATE employees SET is_active = :is_active WHERE id = :id', { id: req.params.id, is_active: body.is_active });
    const rows = await query(
      `SELECT e.id, e.name, e.email, e.phone, e.address, e.is_active, e.created_at, r.name AS role
       FROM employees e JOIN roles r ON r.id = e.role_id
       WHERE e.id = :id`,
      { id: req.params.id }
    );
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    await ensureEmployeeColumns();
    const target = await query(
      `SELECT e.is_active, e.deleted_at, r.name AS role
       FROM employees e JOIN roles r ON r.id = e.role_id
       WHERE e.id = :id`,
      { id: req.params.id }
    );
    if (!target.length || target[0].deleted_at) return res.status(404).json({ message: 'Employee not found.' });

    const targetRole = String(target[0]?.role || '').toUpperCase();
    if (targetRole === 'OWNER') {
      return res.status(403).json({ message: 'The owner account cannot be removed.' });
    }
    if (target[0].is_active) {
      return res.status(400).json({ message: 'Deactivate this employee before deleting.' });
    }

    await query('UPDATE employees SET deleted_at = CURRENT_TIMESTAMP, is_active = FALSE WHERE id = :id', { id: req.params.id });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
