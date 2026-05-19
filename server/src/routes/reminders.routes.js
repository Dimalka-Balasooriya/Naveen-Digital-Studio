import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const params = {};
    const filter = req.user.role === 'production' ? 'AND (r.employee_id = :employeeId OR r.employee_id IS NULL)' : '';
    if (req.user.role === 'production') params.employeeId = req.user.id;

    const reminders = await query(
      `SELECT r.*, o.order_number, e.name AS employee_name
       FROM reminders r
       LEFT JOIN orders o ON o.id = r.order_id
       LEFT JOIN employees e ON e.id = r.employee_id
       WHERE r.is_read = FALSE AND r.remind_at <= DATE_ADD(NOW(), INTERVAL 30 MINUTE)
       ${filter}
       ORDER BY r.remind_at ASC`,
      params
    );

    res.json(reminders);
  } catch (error) {
    next(error);
  }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const body = z.object({
      order_id: z.number().int().positive().optional().nullable(),
      employee_id: z.number().int().positive().optional().nullable(),
      title: z.string().min(2),
      message: z.string().min(2),
      remind_at: z.string().min(10),
      interval_minutes: z.number().int().positive().optional()
    }).parse(req.body);

    const result = await query(
      `INSERT INTO reminders (order_id, employee_id, title, message, remind_at, interval_minutes, created_by)
       VALUES (:order_id, :employee_id, :title, :message, :remind_at, :interval_minutes, :created_by)`,
      { ...body, interval_minutes: body.interval_minutes || 30, created_by: req.user.id }
    );
    const rows = await query('SELECT * FROM reminders WHERE id = :id', { id: result.insertId });
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    await query('UPDATE reminders SET is_read = TRUE WHERE id = :id', { id: req.params.id });
    res.json({ message: 'Reminder marked as read.' });
  } catch (error) {
    next(error);
  }
});

export default router;
