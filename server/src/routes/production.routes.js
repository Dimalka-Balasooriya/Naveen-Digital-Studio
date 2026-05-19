import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ensureOrderTasks } from '../utils/orders.js';
import { markOrderCommissionsPayable, recordStatusChange } from '../utils/tracking.js';

const router = Router();

router.use(authenticate, requireRole('production', 'admin'));

router.get('/orders', async (req, res, next) => {
  try {
    const params = {};
    const assigneeFilter = req.user.role === 'production' ? 'WHERE o.assigned_employee_id = :employeeId' : '';
    if (req.user.role === 'production') params.employeeId = req.user.id;

    const orders = await query(
      `SELECT o.id, o.order_number, o.order_quantity, o.needed_date, o.is_fast, o.production_progress, o.design_notes, o.status_id,
        c.name AS customer_name, c.phone AS customer_phone, p.name AS product_name,
        s.name AS status_name, s.color AS status_color,
        admin.name AS assigned_by_admin_name, oa.assigned_by_role, oa.assignment_started_at AS assigned_at,
        oa.commission_amount AS assigned_commission
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN products p ON p.id = o.product_id
       JOIN order_statuses s ON s.id = o.status_id
       LEFT JOIN order_assignments oa ON oa.order_id = o.id AND oa.is_current = TRUE
       LEFT JOIN employees admin ON admin.id = oa.assigned_by_admin_id
       ${assigneeFilter}
       ORDER BY o.is_fast DESC, o.needed_date ASC`,
      params
    );

    res.json(orders);
  } catch (error) {
    next(error);
  }
});

router.patch('/orders/:id/progress', async (req, res, next) => {
  try {
    const body = z.object({
      production_progress: z.number().int().min(0).max(100),
      status_id: z.number().int().positive().optional()
    }).parse(req.body);

    const ownership = await query('SELECT assigned_employee_id, status_id FROM orders WHERE id = :id', { id: req.params.id });
    if (!ownership.length) return res.status(404).json({ message: 'Order not found.' });
    if (req.user.role === 'production' && ownership[0].assigned_employee_id !== req.user.id) {
      return res.status(403).json({ message: 'This order is not assigned to you.' });
    }

    await query(
      `UPDATE orders SET production_progress = :progress${body.status_id ? ', status_id = :status_id' : ''} WHERE id = :id`,
      { progress: body.production_progress, status_id: body.status_id, id: req.params.id }
    );
    if (body.status_id && body.status_id !== ownership[0].status_id) {
      await recordStatusChange({
        orderId: req.params.id,
        fromStatusId: ownership[0].status_id,
        toStatusId: body.status_id,
        changedBy: req.user.id,
        note: 'Updated from production panel'
      });
      const status = await query('SELECT name FROM order_statuses WHERE id = :id', { id: body.status_id });
      if (status[0]?.name === 'Completed') {
        await markOrderCommissionsPayable({ orderId: req.params.id });
      }
    }
    await query('INSERT INTO order_activity (order_id, employee_id, action, details) VALUES (:id, :employee, :action, :details)', {
      id: req.params.id,
      employee: req.user.id,
      action: 'Updated production progress',
      details: `${body.production_progress}%`
    });

    res.json({ message: 'Progress updated.' });
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:id/tasks/:taskId/toggle', async (req, res, next) => {
  try {
    await ensureOrderTasks(req.params.id);
    const body = z.object({ is_completed: z.boolean() }).parse(req.body);
    const ownership = await query('SELECT assigned_employee_id FROM orders WHERE id = :id', { id: req.params.id });
    if (!ownership.length) return res.status(404).json({ message: 'Order not found.' });
    if (req.user.role === 'production' && ownership[0].assigned_employee_id !== req.user.id) {
      return res.status(403).json({ message: 'This order is not assigned to you.' });
    }

    await query(
      `UPDATE order_task_completions
       SET is_completed = :completed, completed_by = :employee, completed_at = ${body.is_completed ? 'NOW()' : 'NULL'}
       WHERE order_id = :orderId AND task_id = :taskId`,
      {
        completed: body.is_completed,
        employee: body.is_completed ? req.user.id : null,
        orderId: req.params.id,
        taskId: req.params.taskId
      }
    );

    const stats = await query(
      `SELECT ROUND(100 * SUM(is_completed = TRUE) / COUNT(*)) AS progress
       FROM order_task_completions
       WHERE order_id = :orderId`,
      { orderId: req.params.id }
    );
    await query('UPDATE orders SET production_progress = :progress WHERE id = :orderId', {
      progress: stats[0].progress || 0,
      orderId: req.params.id
    });

    res.json({ message: 'Task updated.', production_progress: stats[0].progress || 0 });
  } catch (error) {
    next(error);
  }
});

router.get('/profile/stats', async (req, res, next) => {
  try {
    const stats = await query(
      `SELECT
        COALESCE(SUM(o.order_quantity), 0) AS assigned_orders,
        COALESCE(SUM(CASE WHEN s.name = 'Completed' THEN o.order_quantity ELSE 0 END), 0) AS completed_orders,
        SUM(o.is_fast = TRUE) AS fast_orders,
        ROUND(AVG(o.production_progress)) AS average_progress
       FROM orders o
       JOIN order_statuses s ON s.id = o.status_id
       WHERE o.assigned_employee_id = :employeeId`,
      { employeeId: req.user.id }
    );
    res.json(stats[0]);
  } catch (error) {
    next(error);
  }
});

router.get('/commissions', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT c.*, o.order_number, s.name AS status_name
       FROM commissions c
       JOIN orders o ON o.id = c.order_id
       JOIN order_statuses s ON s.id = o.status_id
       WHERE c.employee_id = :employeeId
       ORDER BY c.assignment_started_at DESC`,
      { employeeId: req.user.id }
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

export default router;
