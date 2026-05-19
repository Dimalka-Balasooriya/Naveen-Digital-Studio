import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { authenticate, requireOwner, requireRole } from '../middleware/auth.js';

const router = Router();

const lookupTables = {
  pages: 'facebook_pages',
  products: 'products',
  statuses: 'order_statuses',
  tasks: 'production_tasks'
};

const schemas = {
  pages: z.object({ name: z.string().min(2), url: z.string().url().optional().nullable(), is_active: z.boolean().optional() }),
  products: z.object({ name: z.string().min(2), description: z.string().optional().nullable(), base_price: z.number().nonnegative().optional(), is_active: z.boolean().optional() }),
  statuses: z.object({ name: z.string().min(2), color: z.string().min(2).optional(), sort_order: z.number().int().optional(), is_final: z.boolean().optional(), is_active: z.boolean().optional() }),
  tasks: z.object({ name: z.string().min(2), description: z.string().optional().nullable(), sort_order: z.number().int().optional(), is_active: z.boolean().optional() })
};

router.get('/:type', authenticate, async (req, res, next) => {
  try {
    const table = lookupTables[req.params.type];
    if (!table) return res.status(404).json({ message: 'Lookup type not found.' });

    const orderBy = req.params.type === 'pages' || req.params.type === 'products' ? 'name' : 'sort_order, name';
    const rows = await query(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/:type', authenticate, requireOwner, async (req, res, next) => {
  try {
    const type = req.params.type;
    const table = lookupTables[type];
    if (!table) return res.status(404).json({ message: 'Lookup type not found.' });
    const body = schemas[type].parse(req.body);
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

router.put('/:type/:id', authenticate, requireOwner, async (req, res, next) => {
  try {
    const type = req.params.type;
    const table = lookupTables[type];
    if (!table) return res.status(404).json({ message: 'Lookup type not found.' });
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

router.delete('/:type/:id', authenticate, requireOwner, async (req, res, next) => {
  try {
    const table = lookupTables[req.params.type];
    if (!table) return res.status(404).json({ message: 'Lookup type not found.' });
    await query(`UPDATE ${table} SET is_active = FALSE WHERE id = :id`, { id: req.params.id });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
