import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { authenticate, requireOwner, requireRole } from '../middleware/auth.js';
import { ensureStatusWorkflowSupport } from '../utils/tracking.js';

const router = Router();

router.use(authenticate);

router.get('/', requireRole('admin', 'production'), async (req, res, next) => {
  try {
    const params = {};
    const filter = req.user.role === 'PRODUCTION_EMPLOYEE'
      ? 'WHERE c.employee_id = :employeeId AND r.name <> \'OWNER\' AND e.deleted_at IS NULL'
      : 'WHERE r.name <> \'OWNER\' AND e.deleted_at IS NULL';
    if (req.user.role === 'PRODUCTION_EMPLOYEE') params.employeeId = req.user.id;

    const rows = await query(
      `SELECT c.*, e.name AS employee_name, o.order_number, s.name AS status_name
       FROM commissions c
       JOIN employees e ON e.id = c.employee_id
       JOIN roles r ON r.id = e.role_id
       JOIN orders o ON o.id = c.order_id
       JOIN order_statuses s ON s.id = o.status_id
       ${filter}
       ORDER BY c.assignment_started_at DESC`,
      params
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/all', requireRole('admin', 'production'), async (req, res, next) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const monthStart = `${month}-01`;

    const rows = await query(
      `SELECT
        e.id AS employee_id,
        e.name AS employee_name,
        r.name AS employee_role,
        COUNT(DISTINCT assigned_orders.id) AS total_orders_assigned,
        COUNT(DISTINCT CASE WHEN s.name = 'Completed' THEN assigned_orders.id END) AS completed_orders,
        COUNT(DISTINCT CASE WHEN s.name NOT IN ('Completed', 'Returned', 'Return', 'Cancel', 'Cancelled') THEN assigned_orders.id END) AS pending_orders,
        COALESCE(MAX(c.today_commission_total), 0) AS today_commission_total,
        COALESCE(MAX(c.monthly_commission_total), 0) AS monthly_commission_total,
        COALESCE(MAX(c.weekly_commission_total), 0) AS weekly_commission_total,
        COALESCE(MAX(c.total_commission), 0) AS total_commission,
        COALESCE(MAX(c.assigned_commission_rate), 0) AS assigned_commission_rate,
        MAX(c.last_commission_updated_at) AS last_commission_updated_at,
        MAX(latest_status.name) AS latest_order_status
       FROM employees e
       JOIN roles r ON r.id = e.role_id
       LEFT JOIN orders assigned_orders ON assigned_orders.assigned_employee_id = e.id
       LEFT JOIN order_statuses s ON s.id = assigned_orders.status_id
       LEFT JOIN (
         SELECT latest.employee_id,
           SUM(CASE WHEN DATE(latest.assignment_started_at) = CURDATE() THEN latest.commission_amount ELSE 0 END) AS today_commission_total,
           SUM(CASE WHEN DATE(latest.assignment_started_at) BETWEEN :monthStart AND LAST_DAY(:monthStart) THEN latest.commission_amount ELSE 0 END) AS monthly_commission_total,
           SUM(CASE WHEN YEARWEEK(latest.assignment_started_at, 1) = YEARWEEK(CURDATE(), 1) THEN latest.commission_amount ELSE 0 END) AS weekly_commission_total,
           SUM(latest.commission_amount) AS total_commission,
           MAX(latest.commission_amount) AS assigned_commission_rate,
           MAX(latest.updated_at) AS last_commission_updated_at
         FROM commissions latest
         JOIN (
           SELECT employee_id, order_id, commission_type, MAX(id) AS latest_id
           FROM commissions
           GROUP BY employee_id, order_id, commission_type
         ) picked ON picked.latest_id = latest.id
         GROUP BY latest.employee_id
       ) c ON c.employee_id = e.id
       LEFT JOIN commissions latest_commission ON latest_commission.id = (
         SELECT lc.id
         FROM commissions lc
         WHERE lc.employee_id = e.id
           AND DATE(lc.assignment_started_at) BETWEEN :monthStart AND LAST_DAY(:monthStart)
         ORDER BY lc.assignment_started_at DESC, lc.id DESC
         LIMIT 1
       )
       LEFT JOIN orders latest_order ON latest_order.id = latest_commission.order_id
       LEFT JOIN order_statuses latest_status ON latest_status.id = latest_order.status_id
       WHERE e.is_active = TRUE
         AND e.deleted_at IS NULL
         AND r.name <> 'OWNER'
       GROUP BY e.id, r.name
       ORDER BY monthly_commission_total DESC, completed_orders DESC, e.name`,
      { monthStart }
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/summary/me', requireRole('admin', 'production'), async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT
        COALESCE(SUM(CASE WHEN DATE(latest.assignment_started_at) = CURDATE() THEN latest.commission_amount ELSE 0 END), 0) AS today_commission,
        COALESCE(SUM(CASE WHEN YEARWEEK(latest.assignment_started_at, 1) = YEARWEEK(CURDATE(), 1) THEN latest.commission_amount ELSE 0 END), 0) AS weekly_commission,
        COALESCE(SUM(CASE WHEN YEAR(latest.assignment_started_at) = YEAR(CURDATE()) AND MONTH(latest.assignment_started_at) = MONTH(CURDATE()) THEN latest.commission_amount ELSE 0 END), 0) AS monthly_commission,
        COALESCE(SUM(latest.commission_amount), 0) AS total_commission
       FROM commissions latest
       JOIN (
         SELECT employee_id, order_id, commission_type, MAX(id) AS latest_id
         FROM commissions
         WHERE employee_id = :employeeId
         GROUP BY employee_id, order_id, commission_type
       ) picked ON picked.latest_id = latest.id`,
      { employeeId: req.user.id }
    );
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', requireOwner, async (req, res, next) => {
  try {
    const body = z.object({
      commission_amount: z.number().nonnegative(),
      notes: z.string().optional().nullable()
    }).parse(req.body);

    await query(
      'UPDATE commissions SET commission_amount = :amount, notes = :notes WHERE id = :id',
      { amount: body.commission_amount, notes: body.notes || null, id: req.params.id }
    );
    res.json({ message: 'Commission updated.' });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/paid', requireRole('admin'), async (req, res, next) => {
  try {
    await ensureStatusWorkflowSupport();
    const body = z.object({
      is_paid: z.boolean().default(true),
      notes: z.string().optional().nullable()
    }).parse(req.body);

    const rows = await query(
      `SELECT id, commission_amount, paid_amount, paid_at
       FROM commissions
       WHERE id = :id`,
      { id: req.params.id }
    );
    if (!rows.length) return res.status(404).json({ message: 'Commission not found.' });

    if (body.is_paid) {
      await query(
        `UPDATE commissions
         SET paid_amount = CASE
             WHEN paid_at IS NULL THEN commission_amount
             ELSE paid_amount
           END,
           commission_amount = 0,
           is_payable = FALSE,
           paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
           payment_notes = :notes
         WHERE id = :id`,
        { id: req.params.id, notes: body.notes || 'Commission paid' }
      );
      return res.json({ message: 'Commission marked as paid.' });
    }

    await query(
      `UPDATE commissions
       SET commission_amount = CASE WHEN paid_amount > 0 THEN paid_amount ELSE commission_amount END,
           paid_amount = 0,
           is_payable = TRUE,
           paid_at = NULL,
           payment_notes = :notes
       WHERE id = :id`,
      { id: req.params.id, notes: body.notes || null }
    );
    res.json({ message: 'Commission payment mark removed.' });
  } catch (error) {
    next(error);
  }
});

export default router;
