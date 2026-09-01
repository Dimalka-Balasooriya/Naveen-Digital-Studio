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
let orderArchiveSupportPromise = null;
async function ensureOrderArchiveSupport() {
  if (hasCheckedOrderArchiveColumns) return;
  if (orderArchiveSupportPromise) return orderArchiveSupportPromise;

  orderArchiveSupportPromise = (async () => {
  const runSchemaChange = async (sql) => {
    try {
      return await query(sql);
    } catch (error) {
      if (['ER_DUP_FIELDNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME'].includes(error?.code)) return null;
      throw error;
    }
  };
  const columns = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'orders'
       AND COLUMN_NAME IN ('deleted_at', 'deleted_by', 'is_deleted', 'archived_from_active_list', 'is_future_order', 'future_needed_date', 'future_note', 'is_wholesale', 'wholesale_bill_id')`
  );
  const existing = new Set(columns.map((column) => column.COLUMN_NAME));
  if (!existing.has('deleted_at')) await runSchemaChange('ALTER TABLE orders ADD COLUMN deleted_at TIMESTAMP NULL AFTER updated_at');
  if (!existing.has('deleted_by')) await runSchemaChange('ALTER TABLE orders ADD COLUMN deleted_by INT NULL AFTER deleted_at');
  if (!existing.has('is_deleted')) await runSchemaChange('ALTER TABLE orders ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE AFTER deleted_by');
  if (!existing.has('archived_from_active_list')) await runSchemaChange('ALTER TABLE orders ADD COLUMN archived_from_active_list BOOLEAN NOT NULL DEFAULT FALSE AFTER is_deleted');
  if (!existing.has('is_future_order')) await runSchemaChange('ALTER TABLE orders ADD COLUMN is_future_order BOOLEAN NOT NULL DEFAULT FALSE AFTER is_fast');
  if (!existing.has('is_wholesale')) await runSchemaChange('ALTER TABLE orders ADD COLUMN is_wholesale BOOLEAN NOT NULL DEFAULT FALSE AFTER is_future_order');
  if (!existing.has('wholesale_bill_id')) await runSchemaChange('ALTER TABLE orders ADD COLUMN wholesale_bill_id INT NULL AFTER is_wholesale');
  if (!existing.has('future_needed_date')) await runSchemaChange('ALTER TABLE orders ADD COLUMN future_needed_date DATE NULL AFTER is_future_order');
  if (!existing.has('future_note')) await runSchemaChange('ALTER TABLE orders ADD COLUMN future_note TEXT NULL AFTER future_needed_date');
  await runSchemaChange(`
    CREATE TABLE IF NOT EXISTS wholesale_order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      stock_item_id INT NULL,
      catalog_item_id INT NULL,
      item_name VARCHAR(160) NOT NULL,
      item_code VARCHAR(40) NULL,
      branch_name VARCHAR(120) NULL,
      branch_code VARCHAR(30) NULL,
      quantity INT NOT NULL DEFAULT 1,
      unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
      line_total DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_wholesale_order_items_order (order_id),
      CONSTRAINT fk_production_wholesale_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
  `);
  const wholesaleItemColumns = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'wholesale_order_items'
       AND COLUMN_NAME IN ('catalog_item_id')`
  );
  const existingWholesaleItemColumns = new Set(wholesaleItemColumns.map((column) => column.COLUMN_NAME));
  if (!existingWholesaleItemColumns.has('catalog_item_id')) {
    await runSchemaChange('ALTER TABLE wholesale_order_items ADD COLUMN catalog_item_id INT NULL AFTER stock_item_id');
  }
  hasCheckedOrderArchiveColumns = true;
  })().finally(() => {
    orderArchiveSupportPromise = null;
  });
  return orderArchiveSupportPromise;
}

let hasCheckedWholesaleBillOrderColumn = false;
let hasWholesaleBillOrderColumn = false;
async function supportsWholesaleBillOrderLink() {
  if (hasCheckedWholesaleBillOrderColumn) return hasWholesaleBillOrderColumn;
  const columns = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'stock_wholesale_bills'
       AND COLUMN_NAME = 'order_id'`
  );
  hasWholesaleBillOrderColumn = columns.length > 0;
  hasCheckedWholesaleBillOrderColumn = true;
  return hasWholesaleBillOrderColumn;
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
    if (req.query.status_id) {
      filters.push('o.status_id = :statusId');
      params.statusId = req.query.status_id;
    }
    if (req.query.status) {
      filters.push('LOWER(s.name) = LOWER(:statusName)');
      params.statusName = req.query.status;
    }
    const where = `WHERE ${filters.join(' AND ')}`;
    const assignmentJoin = isWorkerRole(req.user.role)
      ? `LEFT JOIN order_assignments oa ON oa.id = (
          SELECT picked_assignment.id
          FROM order_assignments picked_assignment
          WHERE picked_assignment.order_id = o.id
            AND COALESCE(picked_assignment.is_current, TRUE) = TRUE
            AND picked_assignment.assigned_to_employee_id = :employeeId
          ORDER BY picked_assignment.task_id IS NULL DESC, picked_assignment.assignment_started_at DESC, picked_assignment.id DESC
          LIMIT 1
        )`
      : `LEFT JOIN order_assignments oa ON oa.id = (
          SELECT picked_assignment.id
          FROM order_assignments picked_assignment
          WHERE picked_assignment.order_id = o.id
            AND COALESCE(picked_assignment.is_current, TRUE) = TRUE
            AND picked_assignment.task_id IS NULL
          ORDER BY picked_assignment.assignment_started_at DESC, picked_assignment.id DESC
          LIMIT 1
        )`;

    const orders = await query(
      `SELECT o.id, o.order_number, o.order_quantity, o.needed_date, o.is_fast, o.is_future_order, o.future_needed_date, o.future_note,
        o.is_wholesale, o.wholesale_bill_id, o.assigned_employee_id, o.total_amount, o.advance_amount, o.production_progress, o.design_notes, o.status_id,
        c.name AS customer_name, c.phone AS customer_phone, p.name AS product_name,
        s.name AS status_name, s.color AS status_color,
        admin.name AS assigned_by_admin_name, oa.assigned_to_employee_id AS current_assignment_employee_id, oa.assigned_by_role, oa.assignment_started_at AS assigned_at,
        oa.commission_amount AS assigned_commission
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN products p ON p.id = o.product_id
       JOIN order_statuses s ON s.id = o.status_id
       ${assignmentJoin}
       LEFT JOIN employees admin ON admin.id = oa.assigned_by_admin_id
       ${where}
       ORDER BY o.is_fast DESC, o.needed_date ASC`,
      params
    );
    const orderIds = orders.map((order) => Number(order.id)).filter(Boolean);
    const itemsByOrder = new Map();
    if (orderIds.length) {
      const idParams = Object.fromEntries(orderIds.map((id, index) => [`itemOrder${index}`, id]));
      const placeholders = orderIds.map((_, index) => `:itemOrder${index}`).join(', ');
      const items = await query(
        `SELECT *
         FROM wholesale_order_items
         WHERE order_id IN (${placeholders})
         ORDER BY order_id ASC, id ASC`,
        idParams
      );
      items.forEach((item) => {
        const orderId = Number(item.order_id);
        const list = itemsByOrder.get(orderId) || [];
        list.push(item);
        itemsByOrder.set(orderId, list);
      });
    }

    const wholesaleBillIds = [...new Set(orders
      .map((order) => Number(order.wholesale_bill_id))
      .filter(Boolean))];
    const billClauses = [];
    const billParams = {};
    if (orderIds.length) {
      billClauses.push(`order_id IN (${orderIds.map((_, index) => `:billOrder${index}`).join(', ')})`);
      orderIds.forEach((id, index) => {
        billParams[`billOrder${index}`] = id;
      });
    }
    if (wholesaleBillIds.length) {
      billClauses.push(`id IN (${wholesaleBillIds.map((_, index) => `:bill${index}`).join(', ')})`);
      wholesaleBillIds.forEach((id, index) => {
        billParams[`bill${index}`] = id;
      });
    }

    const billsById = new Map();
    const billsByOrder = new Map();
    const canLinkWholesaleBills = await supportsWholesaleBillOrderLink();
    if (canLinkWholesaleBills && billClauses.length) {
      const bills = await query(
        `SELECT id, order_id, bill_number, total_amount, generated_at
         FROM stock_wholesale_bills
         WHERE ${billClauses.join(' OR ')}
         ORDER BY order_id ASC, generated_at DESC, id DESC`,
        billParams
      );
      bills.forEach((bill) => {
        billsById.set(Number(bill.id), bill);
        const orderId = Number(bill.order_id);
        if (orderId && !billsByOrder.has(orderId)) billsByOrder.set(orderId, bill);
      });
    }

    orders.forEach((order) => {
      const orderId = Number(order.id);
      const wholesaleItems = itemsByOrder.get(orderId) || [];
      const linkedBill = order.wholesale_bill_id ? billsById.get(Number(order.wholesale_bill_id)) : null;
      const bill = linkedBill || billsByOrder.get(orderId) || null;
      order.wholesale_items = wholesaleItems;
      order.is_wholesale = Boolean(order.is_wholesale || wholesaleItems.length || bill);
      if (bill) order.wholesale_bill_id = bill.id;

      const workerCanViewBill = !isWorkerRole(req.user.role)
        || Number(order.assigned_employee_id) === Number(req.user.id)
        || Number(order.current_assignment_employee_id) === Number(req.user.id);
      if (bill && workerCanViewBill) {
        order.linked_wholesale_bill = {
          id: bill.id,
          bill_number: bill.bill_number,
          generated_at: bill.generated_at,
          total_amount: bill.total_amount,
          pdf_available: true
        };
      }
    });

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
