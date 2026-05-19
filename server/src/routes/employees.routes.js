import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../config/db.js';
import { authenticate, requireAdminOrCoAdmin, requireOwner } from '../middleware/auth.js';

const router = Router();

const employeeSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  role: z.enum(['OWNER', 'CO_ADMIN', 'PRODUCTION_EMPLOYEE', 'admin', 'production']),
  password: z.string().min(6).optional(),
  is_active: z.boolean().optional()
});

router.get('/', authenticate, requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    const employees = await query(
      `SELECT e.id, e.name, e.email, e.phone, e.is_active, e.created_at, r.name AS role,
        COUNT(o.id) AS assigned_orders,
        SUM(s.name = 'Completed') AS completed_orders
       FROM employees e
       JOIN roles r ON r.id = e.role_id
       LEFT JOIN orders o ON o.assigned_employee_id = e.id
       LEFT JOIN order_statuses s ON s.id = o.status_id
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
    const body = employeeSchema.extend({ password: z.string().min(6) }).parse(req.body);
    if (req.user.role !== 'OWNER' && body.role !== 'PRODUCTION_EMPLOYEE' && body.role !== 'production') {
      return res.status(403).json({ message: 'Only the owner can create owners or co-admins.' });
    }
    const roles = await query('SELECT id FROM roles WHERE name = :role', { role: body.role });
    const password_hash = await bcrypt.hash(body.password, 10);
    const result = await query(
      `INSERT INTO employees (role_id, name, email, phone, password_hash, is_active)
       VALUES (:role_id, :name, :email, :phone, :password_hash, :is_active)`,
      {
        role_id: roles[0].id,
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        password_hash,
        is_active: body.is_active ?? true
      }
    );
    const rows = await query('SELECT id, name, email, phone, is_active FROM employees WHERE id = :id', { id: result.insertId });
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    const body = employeeSchema.partial().parse(req.body);
    const target = await query(
      `SELECT e.id, r.name AS role
       FROM employees e JOIN roles r ON r.id = e.role_id
       WHERE e.id = :id`,
      { id: req.params.id }
    );
    if (!target.length) return res.status(404).json({ message: 'Employee not found.' });
    const targetRole = String(target[0].role).toUpperCase();
    if (req.user.role !== 'OWNER' && (targetRole === 'OWNER' || body.role === 'OWNER' || body.role === 'CO_ADMIN')) {
      return res.status(403).json({ message: 'Co-admins cannot edit owner or co-admin permissions.' });
    }
    const updates = { ...body };
    delete updates.role;
    delete updates.password;

    if (body.role) {
      const roles = await query('SELECT id FROM roles WHERE name = :role', { role: body.role });
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
    const rows = await query('SELECT id, name, email, phone, is_active FROM employees WHERE id = :id', { id: req.params.id });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    const target = await query(
      `SELECT r.name AS role FROM employees e JOIN roles r ON r.id = e.role_id WHERE e.id = :id`,
      { id: req.params.id }
    );
    const targetRole = String(target[0]?.role || '').toUpperCase();
    if (targetRole === 'OWNER') {
      return res.status(403).json({ message: 'The owner account cannot be removed.' });
    }
    if (req.user.role !== 'OWNER' && targetRole === 'CO_ADMIN') {
      return res.status(403).json({ message: 'Only the owner can remove co-admins.' });
    }
    await query('UPDATE employees SET is_active = FALSE WHERE id = :id', { id: req.params.id });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
