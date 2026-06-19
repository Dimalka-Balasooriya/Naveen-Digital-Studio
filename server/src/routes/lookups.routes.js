import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { authenticate, requireAdminOrCoAdmin } from '../middleware/auth.js';

const router = Router();

const lookupTables = {
  pages: 'facebook_pages',
  products: 'products',
  statuses: 'order_statuses',
  tasks: 'production_tasks',
  couriers: 'courier_services'
};

const schemas = {
  pages: z.object({ name: z.string().min(2), whatsapp_number: z.string().optional().nullable(), is_active: z.boolean().optional() }),
  products: z.object({ name: z.string().min(2), is_active: z.boolean().optional() }),
  statuses: z.object({ name: z.string().min(2), color: z.string().min(2).optional(), sort_order: z.number().int().optional(), is_final: z.boolean().optional(), is_active: z.boolean().optional() }),
  tasks: z.object({ name: z.string().min(2), description: z.string().optional().nullable(), sort_order: z.number().int().optional(), is_active: z.boolean().optional() }),
  couriers: z.object({ name: z.string().min(2), phone: z.string().optional().nullable(), is_active: z.boolean().optional() })
};

let hasCheckedFacebookPageColumns = false;

async function ensureFacebookPageColumns() {
  if (hasCheckedFacebookPageColumns) return;

  const rows = await query(
    `SELECT COUNT(*) AS column_count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'facebook_pages'
       AND COLUMN_NAME = 'whatsapp_number'`
  );

  if (!Number(rows[0]?.column_count || 0)) {
    await query('ALTER TABLE facebook_pages ADD COLUMN whatsapp_number VARCHAR(30) NULL AFTER name');
  }

  hasCheckedFacebookPageColumns = true;
}

async function ensureCourierServicesTable() {
  await query(`CREATE TABLE IF NOT EXISTS courier_services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    phone VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
}

router.get('/:type', authenticate, async (req, res, next) => {
  try {
    const table = lookupTables[req.params.type];
    if (!table) return res.status(404).json({ message: 'Lookup type not found.' });
    if (req.params.type === 'couriers') await ensureCourierServicesTable();

    const orderBy = ['pages', 'products', 'couriers'].includes(req.params.type) ? 'name' : 'sort_order, name';
    const includeInactive = req.params.type === 'statuses' && req.query.include_inactive === 'true';
    const where = includeInactive ? '' : 'WHERE is_active = TRUE';
    const rows = await query(`SELECT * FROM ${table} ${where} ORDER BY ${orderBy}`);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/:type', authenticate, requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    const type = req.params.type;
    const table = lookupTables[type];
    if (!table) return res.status(404).json({ message: 'Lookup type not found.' });
    if (type === 'pages') await ensureFacebookPageColumns();
    if (type === 'couriers') await ensureCourierServicesTable();

    const body = schemas[type].parse(req.body);
    if (['pages', 'products', 'statuses', 'couriers'].includes(type)) {
      const existing = await query(`SELECT id, is_active FROM ${table} WHERE LOWER(name) = LOWER(:name) LIMIT 1`, { name: body.name });
      if (existing.length && existing[0].is_active) {
        return res.status(409).json({ message: `${body.name} already exists.` });
      }
      if (existing.length) {
        const keys = Object.keys({ ...body, is_active: true });
        const payload = { ...body, is_active: true, id: existing[0].id };
        await query(`UPDATE ${table} SET ${keys.map((key) => `${key} = :${key}`).join(', ')} WHERE id = :id`, payload);
        const rows = await query(`SELECT * FROM ${table} WHERE id = :id`, { id: existing[0].id });
        return res.status(201).json(rows[0]);
      }
    }
    const keys = Object.keys(body);
    const columns = keys.join(', ');
    const values = keys.map((key) => `:${key}`).join(', ');

    const result = await query(`INSERT INTO ${table} (${columns}) VALUES (${values})`, body);
    const rows = await query(`SELECT * FROM ${table} WHERE id = :id`, { id: result.insertId });
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put('/:type/:id', authenticate, requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    const type = req.params.type;
    const table = lookupTables[type];
    if (!table) return res.status(404).json({ message: 'Lookup type not found.' });
    if (type === 'pages') await ensureFacebookPageColumns();
    if (type === 'couriers') await ensureCourierServicesTable();

    const body = schemas[type].partial().parse(req.body);
    const keys = Object.keys(body);
    if (!keys.length) return res.status(400).json({ message: 'No fields supplied.' });

    const setClause = keys.map((key) => `${key} = :${key}`).join(', ');
    await query(`UPDATE ${table} SET ${setClause} WHERE id = :id`, { ...body, id: req.params.id });
    const rows = await query(`SELECT * FROM ${table} WHERE id = :id`, { id: req.params.id });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete('/:type/:id', authenticate, requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    const table = lookupTables[req.params.type];
    if (!table) return res.status(404).json({ message: 'Lookup type not found.' });
    if (req.params.type === 'couriers') await ensureCourierServicesTable();
    await query(`UPDATE ${table} SET is_active = FALSE WHERE id = :id`, { id: req.params.id });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
