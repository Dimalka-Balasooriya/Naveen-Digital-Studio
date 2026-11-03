import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { queueQuery, updateCalling, listSchema, eligibleWhere } from '../services/calling.service.js';

const router = Router();
const idSchema = z.coerce.number().int().positive();
router.use(authenticate);
router.get('/orders', requireRole('CALLING_AGENT'), async (req, res, next) => {
  try {
    const spec = queueQuery(req.query);
    const [counts, orders] = await Promise.all([query(spec.countSql, spec.params), query(spec.sql, spec.params)]);
    const total = Number(counts[0].total);
    res.json({ orders, pagination: { page: spec.page, limit: spec.limit, total, totalPages: Math.max(1, Math.ceil(total / spec.limit)) } });
  } catch (error) { next(error); }
});
router.get('/orders/:id/history', requireRole('CALLING_AGENT', 'OWNER', 'CO_ADMIN'), async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const { page, limit } = listSchema.parse(req.query);
    const eligible = req.user.role === 'CALLING_AGENT' ? ` AND ${eligibleWhere}` : '';
    const orders = await query(`SELECT o.id FROM orders o JOIN order_statuses s ON s.id=o.status_id WHERE o.id=?${eligible}`, [id]);
    if (!orders.length) return res.status(404).json({ message: 'Order not found or no longer eligible.' });
    const [counts, history] = await Promise.all([
      query('SELECT COUNT(*) AS total FROM order_calling_history WHERE order_id=?', [id]),
      query(`SELECT h.id, h.order_id, h.previous_status, h.new_status, h.agent_id, e.name AS agent_name, h.changed_at, h.notes
        FROM order_calling_history h LEFT JOIN employees e ON e.id=h.agent_id WHERE h.order_id=?
        ORDER BY h.changed_at DESC, h.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`, [id])
    ]);
    const total = Number(counts[0].total);
    res.json({ history, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) { next(error); }
});
router.patch('/orders/:id/status', requireRole('CALLING_AGENT'), async (req, res, next) => {
  let connection;
  try {
    const orderId = idSchema.parse(req.params.id);
    connection = await pool.getConnection();
    const result = await updateCalling(connection, { orderId, agentId: req.user.id, body: req.body });
    res.json({ ...result, message: result.replayed ? 'Previously saved update confirmed.' : result.changed ? 'Calling status saved.' : 'Calling status is unchanged.' });
  } catch (error) { next(error); }
  finally { connection?.release(); }
});
export default router;
