import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { completeCorrection, correctionQueueQuery, pendingCorrectionCountSql } from '../services/correction.service.js';

const router = Router();
router.use(authenticate, requireRole('DESIGN_TEAM'));
router.get('/count', async (req, res, next) => {
  try { const rows = await query(pendingCorrectionCountSql); res.json({ pending_count: Number(rows[0].total) }); }
  catch (error) { next(error); }
});
router.get('/', async (req, res, next) => {
  try {
    const spec = correctionQueueQuery(req.query);
    const [counts, orders] = await Promise.all([query(pendingCorrectionCountSql), query(spec.sql)]);
    const total = Number(counts[0].total);
    res.json({ orders, pagination: { page: spec.page, limit: spec.limit, total, totalPages: Math.max(1, Math.ceil(total / spec.limit)) } });
  } catch (error) { next(error); }
});
router.post('/:id/complete', async (req, res, next) => {
  let connection;
  try {
    const orderId = z.coerce.number().int().positive().parse(req.params.id);
    connection = await pool.getConnection();
    res.json(await completeCorrection(connection, { orderId, user: req.user, body: req.body }));
  } catch (error) { next(error); }
  finally { connection?.release(); }
});
export default router;
