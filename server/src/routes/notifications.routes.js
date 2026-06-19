import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { query } from '../config/db.js';
import { ensureStatusWorkflowSupport } from '../utils/tracking.js';

const router = Router();

router.use(authenticate);

router.get('/rearrange-reminders', async (req, res, next) => {
  try {
    if (req.user.role !== 'CO_ADMIN') return res.json([]);

    await ensureStatusWorkflowSupport();
    const reminders = await query(
      `SELECT o.id AS order_id, o.order_number, c.name AS customer_name,
        s.name AS current_status, latest.changed_at AS rearranged_at,
        latest.changed_by AS status_changed_by_id,
        CONCAT('Order ', o.order_number, ' for ', c.name, ' needs rearrangement. Please check it soon.') AS message
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN order_statuses s ON s.id = o.status_id
       JOIN order_status_history latest ON latest.id = (
         SELECT h.id
         FROM order_status_history h
         WHERE h.order_id = o.id
         ORDER BY h.changed_at DESC, h.id DESC
         LIMIT 1
       )
       WHERE s.name = 'Rearrange'
         AND latest.changed_by = :employeeId
         AND latest.changed_at <= NOW()
       ORDER BY latest.changed_at ASC`,
      { employeeId: req.user.id }
    );

    res.json(reminders);
  } catch (error) {
    next(error);
  }
});

export default router;
