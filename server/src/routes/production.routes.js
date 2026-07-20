import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ensureOrderTasks } from '../utils/orders.js';
import { applyOrderStatusWorkflow, ensureProductionAllowedStatuses, isProductionAllowedStatus, recordStatusChange } from '../utils/tracking.js';

const router = Router();

router.use(authenticate, requireRole('production', 'admin'));

function isWorkerRole(role) {
  return ['PRODUCTION_EMPLOYEE', 'DESIGN_TEAM'].includes(String(role || '').toUpperCase());
}

let hasCheckedOrderArchiveColumns = false;
async function ensureOrderArchiveSupport() {
  if (hasCheckedOrderArchiveColumns) return;
  const columns = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'orders'
       AND COLUMN_NAME IN ('deleted_at', 'deleted_by', 'is_deleted', 'archived_from_active_list', 'is_future_order', 'future_needed_date', 'future_note')`
  );
  const existing = new Set(columns.map((column) => column.COLUMN_NAME));
  if (!existing.has('deleted_at')) await query('ALTER TABLE orders ADD COLUMN deleted_at TIMESTAMP NULL AFTER updated_at');
  if (!existing.has('deleted_by')) await query('ALTER TABLE orders ADD COLUMN deleted_by INT NULL AFTER deleted_at');
  if (!existing.has('is_deleted')) await query('ALTER TABLE orders ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE AFTER deleted_by');
  if (!existing.has('archived_from_active_list')) await query('ALTER TABLE orders ADD COLUMN archived_from_active_list BOOLEAN NOT NULL DEFAULT FALSE AFTER is_deleted');
  if (!existing.has('is_future_order')) await query('ALTER TABLE orders ADD COLUMN is_future_order BOOLEAN NOT NULL DEFAULT FALSE AFTER is_fast');
  if (!existing.has('future_needed_date')) await query('ALTER TABLE orders ADD COLUMN future_needed_date DATE NULL AFTER is_future_order');
  if (!existing.has('future_note')) await query('ALTER TABLE orders ADD COLUMN future_note TEXT NULL AFTER future_needed_date');
  hasCheckedOrderArchiveColumns = true;
}

router.get('/statuses', async (req, res, next) => {
  try {
    const statuses = await ensureProductionAllowedStatuses({ role: req.user.role });
    res.json(statuses);
  } catch (error) {
    next(error);
  }
});

router.get('/orders', async (req, res, next) => {
  try {
    await ensureOrderArchiveSupport();
    const params = {};
    const filters = ['COALESCE(o.archived_from_active_list, FALSE) = FALSE'];
    if (isWorkerRole(req.user.role)) {
      filters.push(`(
        o.assigned_employee_id = :employeeId
        OR EXISTS (
          SELECT 1 FROM assignment_history visible_history
          WHERE visible_history.order_id = o.id
            AND (visible_history.new_employee_id = :employeeId OR visible_history.old_employee_id = :employeeId)
        )
        OR EXISTS (
          SELECT 1 FROM order_assignments visible_assignment
          WHERE visible_assignment.order_id = o.id
            AND visible_assignment.assigned_to_employee_id = :employeeId
        )
      )`);
    }
    if (isWorkerRole(req.user.role)) params.employeeId = req.user.id;
    const where = `WHERE ${filters.join(' AND ')}`;

    const orders = await query(
      `SELECT o.id, o.order_number, o.order_quantity, o.needed_date, o.is_fast, o.is_future_order, o.future_needed_date, o.future_note, o.production_progress, o.design_notes, o.status_id,
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
       ${where}
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

    const ownership = await query(
      `SELECT o.assigned_employee_id, o.status_id,
        EXISTS (
          SELECT 1 FROM assignment_history visible_history
          WHERE visible_history.order_id = o.id
            AND (visible_history.new_employee_id = :employeeId OR visible_history.old_employee_id = :employeeId)
        ) AS has_history_access,
        EXISTS (
          SELECT 1 FROM order_assignments visible_assignment
          WHERE visible_assignment.order_id = o.id
            AND visible_assignment.assigned_to_employee_id = :employeeId
        ) AS has_assignment_access
       FROM orders o
       WHERE o.id = :id`,
      { id: req.params.id, employeeId: req.user.id }
    );
    if (!ownership.length) return res.status(404).json({ message: 'Order not found.' });
    if (isWorkerRole(req.user.role)
      && ownership[0].assigned_employee_id !== req.user.id
      && !Number(ownership[0].has_history_access)
      && !Number(ownership[0].has_assignment_access)) {
      return res.status(403).json({ message: 'This order is not assigned to you.' });
    }
    if (isWorkerRole(req.user.role) && body.status_id) {
      const allowed = await isProductionAllowedStatus({ statusId: body.status_id, role: req.user.role });
      if (!allowed) {
        return res.status(403).json({ message: 'This role can only use its allowed production statuses.' });
      }
    }

    await query(
      `UPDATE orders SET production_progress = :progress${body.status_id ? ', status_id = :status_id' : ''} WHERE id = :id`,
      { progress: body.production_progress, status_id: body.status_id, id: req.params.id }
    );
    let workflowMessage = null;
    if (body.status_id && body.status_id !== ownership[0].status_id) {
      await recordStatusChange({
        orderId: req.params.id,
        fromStatusId: ownership[0].status_id,
        toStatusId: body.status_id,
        changedBy: req.user.id,
        note: 'Updated from production panel'
      });
      workflowMessage = await applyOrderStatusWorkflow({ orderId: req.params.id, statusId: body.status_id });
    }
    await query('INSERT INTO order_activity (order_id, employee_id, action, details) VALUES (:id, :employee, :action, :details)', {
      id: req.params.id,
      employee: req.user.id,
      action: 'Updated production progress',
      details: `${body.production_progress}%`
    });

    res.json({ message: workflowMessage || 'Progress updated.' });
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:id/tasks/:taskId/toggle', async (req, res, next) => {
  try {
    await ensureOrderTasks(req.params.id);
    const body = z.object({ is_completed: z.boolean() }).parse(req.body);
    const ownership = await query(
      `SELECT o.assigned_employee_id,
        EXISTS (
          SELECT 1 FROM assignment_history visible_history
          WHERE visible_history.order_id = o.id
            AND (visible_history.new_employee_id = :employeeId OR visible_history.old_employee_id = :employeeId)
        ) AS has_history_access,
        EXISTS (
          SELECT 1 FROM order_assignments visible_assignment
          WHERE visible_assignment.order_id = o.id
            AND visible_assignment.assigned_to_employee_id = :employeeId
        ) AS has_assignment_access
       FROM orders o
       WHERE o.id = :id`,
      { id: req.params.id, employeeId: req.user.id }
    );
    if (!ownership.length) return res.status(404).json({ message: 'Order not found.' });
    if (isWorkerRole(req.user.role)
      && ownership[0].assigned_employee_id !== req.user.id
      && !Number(ownership[0].has_history_access)
      && !Number(ownership[0].has_assignment_access)) {
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
    await ensureOrderArchiveSupport();
    const stats = await query(
      `SELECT
        COUNT(DISTINCT o.id) AS assigned_orders,
        COUNT(DISTINCT CASE WHEN LOWER(s.name) = 'completed' THEN o.id END) AS completed_orders,
        COUNT(DISTINCT CASE WHEN o.is_fast = TRUE THEN o.id END) AS fast_orders,
        ROUND(AVG(o.production_progress)) AS average_progress
       FROM orders o
       JOIN order_statuses s ON s.id = o.status_id
       WHERE (
           o.assigned_employee_id = :employeeId
           OR EXISTS (
             SELECT 1 FROM assignment_history visible_history
             WHERE visible_history.order_id = o.id
               AND (visible_history.new_employee_id = :employeeId OR visible_history.old_employee_id = :employeeId)
           )
           OR EXISTS (
             SELECT 1 FROM order_assignments visible_assignment
             WHERE visible_assignment.order_id = o.id
               AND visible_assignment.assigned_to_employee_id = :employeeId
           )
         )
         AND COALESCE(o.archived_from_active_list, FALSE) = FALSE`,
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
