import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { authenticate, requireOwner, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', requireRole('admin', 'production'), async (req, res, next) => {
  try {
    const params = {};
    const filter = req.user.role === 'production' ? 'WHERE c.employee_id = :employeeId' : '';
    if (req.user.role === 'production') params.employeeId = req.user.id;

    const rows = await query(
      `SELECT c.*, e.name AS employee_name, o.order_number, s.name AS status_name
       FROM commissions c
       JOIN employees e ON e.id = c.employee_id
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
        COALESCE(SUM(CASE WHEN s.name = 'Completed' THEN assigned_orders.order_quantity ELSE 0 END), 0) AS completed_orders,
        COALESCE(SUM(CASE WHEN s.name NOT IN ('Completed', 'Returned') THEN assigned_orders.order_quantity ELSE 0 END), 0) AS pending_orders,
        COALESCE(SUM(CASE WHEN DATE(c.assignment_started_at) BETWEEN :monthStart AND LAST_DAY(:monthStart) THEN c.commission_amount ELSE 0 END), 0) AS monthly_commission_total,
        COALESCE(SUM(CASE WHEN YEARWEEK(c.assignment_started_at, 1) = YEARWEEK(CURDATE(), 1) THEN c.commission_amount ELSE 0 END), 0) AS weekly_commission_total,
        COALESCE(MAX(c.commission_amount), 0) AS assigned_commission_rate,
        MAX(c.updated_at) AS last_commission_updated_at
       FROM employees e
       JOIN roles r ON r.id = e.role_id
       LEFT JOIN orders assigned_orders ON assigned_orders.assigned_employee_id = e.id
       LEFT JOIN order_statuses s ON s.id = assigned_orders.status_id
       LEFT JOIN commissions c ON c.employee_id = e.id
       WHERE e.is_active = TRUE
       GROUP BY e.id, r.name
       ORDER BY monthly_commission_total DESC, completed_orders DESC, e.name`,
      { monthStart }
    );

    res.json(rows);
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

export default router;
