import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../config/db.js';
import { authenticate, requireOwner, requireRole } from '../middleware/auth.js';
import { createOrderNumber, ensureOrderTasks } from '../utils/orders.js';
import { markOrderCommissionsPayable, recordCommissionAssignment, recordOrderAssignment, recordStatusChange } from '../utils/tracking.js';

const router = Router();

const orderSchema = z.object({
  customer_name: z.string().min(2),
  customer_phone: z.string().min(6),
  customer_address: z.string().optional().nullable(),
  customer_notes: z.string().optional().nullable(),
  product_id: z.number().int().positive(),
  facebook_page_id: z.number().int().positive().optional().nullable(),
  status_id: z.number().int().positive(),
  assigned_employee_id: z.number().int().positive().optional().nullable(),
  commission_amount: z.number().nonnegative().optional(),
  needed_date: z.string().min(10),
  is_fast: z.boolean().optional(),
  quantity: z.number().int().positive().optional(),
  order_quantity: z.number().int().positive().optional(),
  total_amount: z.number().nonnegative().optional(),
  advance_amount: z.number().nonnegative().optional(),
  design_notes: z.string().optional().nullable(),
  return_reason: z.string().optional().nullable()
});

const listSql = `
  SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address,
    p.name AS product_name, fp.name AS facebook_page_name, s.name AS status_name, s.color AS status_color,
    e.name AS assigned_employee_name
  FROM orders o
  JOIN customers c ON c.id = o.customer_id
  JOIN products p ON p.id = o.product_id
  LEFT JOIN facebook_pages fp ON fp.id = o.facebook_page_id
  JOIN order_statuses s ON s.id = o.status_id
  LEFT JOIN employees e ON e.id = o.assigned_employee_id
`;

router.get('/', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const filters = [];
    const params = {};

    if (req.query.search) {
      filters.push('(o.order_number LIKE :search OR c.name LIKE :search OR c.phone LIKE :search)');
      params.search = `%${req.query.search}%`;
    }
    if (req.query.status_id) {
      filters.push('o.status_id = :status_id');
      params.status_id = req.query.status_id;
    }
    if (req.query.fast === 'true') {
      filters.push('o.is_fast = TRUE');
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const orders = await query(`${listSql} ${where} ORDER BY o.is_fast DESC, o.needed_date ASC, o.created_at DESC`, params);
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const rows = await query(`${listSql} WHERE o.id = :id`, { id: req.params.id });
    if (!rows.length) return res.status(404).json({ message: 'Order not found.' });

    if (req.user.role === 'production' && rows[0].assigned_employee_id !== req.user.id) {
      return res.status(403).json({ message: 'This order is not assigned to you.' });
    }

    await ensureOrderTasks(req.params.id);
    const tasks = await query(
      `SELECT pt.id, pt.name, pt.description, pt.sort_order, otc.is_completed, otc.completed_at
       FROM production_tasks pt
       LEFT JOIN order_task_completions otc ON otc.task_id = pt.id AND otc.order_id = :id
       WHERE pt.is_active = TRUE
       ORDER BY pt.sort_order, pt.name`,
      { id: req.params.id }
    );
    const [history, commissions, assignmentHistory] = await Promise.all([
      query(
        `SELECT h.*, fs.name AS from_status_name, ts.name AS to_status_name, e.name AS changed_by_name
         FROM order_status_history h
         LEFT JOIN order_statuses fs ON fs.id = h.from_status_id
         JOIN order_statuses ts ON ts.id = h.to_status_id
         JOIN employees e ON e.id = h.changed_by
         WHERE h.order_id = :id
         ORDER BY h.changed_at DESC`,
        { id: req.params.id }
      ),
      query(
        `SELECT c.*, e.name AS employee_name
         FROM commissions c
         JOIN employees e ON e.id = c.employee_id
         WHERE c.order_id = :id
         ORDER BY c.assignment_started_at DESC`,
        { id: req.params.id }
      ),
      query(
        `SELECT ah.*, old_e.name AS old_employee_name, new_e.name AS new_employee_name,
          admin.name AS changed_by_name, ah.changed_by_role
         FROM assignment_history ah
         LEFT JOIN employees old_e ON old_e.id = ah.old_employee_id
         JOIN employees new_e ON new_e.id = ah.new_employee_id
         JOIN employees admin ON admin.id = ah.changed_by_admin_id
         WHERE ah.order_id = :id
         ORDER BY ah.changed_at DESC`,
        { id: req.params.id }
      )
    ]);
    res.json({ ...rows[0], tasks, history, commissions, assignmentHistory });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, requireRole('admin'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const body = orderSchema.parse(req.body);
    await connection.beginTransaction();

    const [existing] = await connection.execute('SELECT id FROM customers WHERE phone = ?', [body.customer_phone]);
    let customerId = existing[0]?.id;

    if (customerId) {
      await connection.execute(
        'UPDATE customers SET name = ?, address = ?, notes = ? WHERE id = ?',
        [body.customer_name, body.customer_address || null, body.customer_notes || null, customerId]
      );
    } else {
      const [customerResult] = await connection.execute(
        'INSERT INTO customers (name, phone, address, notes) VALUES (?, ?, ?, ?)',
        [body.customer_name, body.customer_phone, body.customer_address || null, body.customer_notes || null]
      );
      customerId = customerResult.insertId;
    }

    const orderNumber = await createOrderNumber();
    const [orderResult] = await connection.execute(
      `INSERT INTO orders (
        order_number, customer_id, product_id, facebook_page_id, status_id, assigned_employee_id,
        needed_date, is_fast, quantity, order_quantity, total_amount, advance_amount, design_notes, return_reason, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber,
        customerId,
        body.product_id,
        body.facebook_page_id || null,
        body.status_id,
        body.assigned_employee_id || null,
        body.needed_date,
        body.is_fast || false,
        body.order_quantity || body.quantity || 1,
        body.order_quantity || body.quantity || 1,
        body.total_amount || 0,
        body.advance_amount || 0,
        body.design_notes || null,
        body.return_reason || null,
        req.user.id
      ]
    );

    await connection.execute('INSERT INTO order_activity (order_id, employee_id, action, details) VALUES (?, ?, ?, ?)', [
      orderResult.insertId,
      req.user.id,
      'Created order',
      orderNumber
    ]);
    await recordStatusChange({
      orderId: orderResult.insertId,
      fromStatusId: null,
      toStatusId: body.status_id,
      changedBy: req.user.id,
      note: 'Order created',
      connection
    });
    await recordCommissionAssignment({
      orderId: orderResult.insertId,
      employeeId: body.assigned_employee_id,
      assignedBy: req.user.id,
      commissionAmount: body.commission_amount || 0,
      connection
    });
    await recordOrderAssignment({
      orderId: orderResult.insertId,
      newEmployeeId: body.assigned_employee_id,
      assignedBy: req.user.id,
      assignedByRole: req.user.role,
      commissionAmount: body.commission_amount || 0,
      reason: 'Initial order assignment',
      connection
    });
    await connection.commit();
    await ensureOrderTasks(orderResult.insertId);

    const rows = await query(`${listSql} WHERE o.id = :id`, { id: orderResult.insertId });
    res.status(201).json(rows[0]);
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

router.put('/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const body = orderSchema.partial().parse(req.body);
    await connection.beginTransaction();

    if (body.customer_name || body.customer_phone || body.customer_address !== undefined || body.customer_notes !== undefined) {
      const [orders] = await connection.execute('SELECT customer_id FROM orders WHERE id = ?', [req.params.id]);
      if (!orders.length) return res.status(404).json({ message: 'Order not found.' });
      await connection.execute(
        `UPDATE customers SET
          name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          address = ?,
          notes = ?
         WHERE id = ?`,
        [
          body.customer_name || null,
          body.customer_phone || null,
          body.customer_address ?? null,
          body.customer_notes ?? null,
          orders[0].customer_id
        ]
      );
    }

    const [existingOrder] = await connection.execute('SELECT status_id, assigned_employee_id FROM orders WHERE id = ?', [req.params.id]);
    if (!existingOrder.length) return res.status(404).json({ message: 'Order not found.' });

    if (body.order_quantity && !body.quantity) {
      body.quantity = body.order_quantity;
    }

    const allowed = ['product_id', 'facebook_page_id', 'status_id', 'assigned_employee_id', 'needed_date', 'is_fast', 'quantity', 'order_quantity', 'total_amount', 'advance_amount', 'design_notes', 'return_reason'];
    const updates = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
    const keys = Object.keys(updates);

    if (keys.length) {
      await connection.execute(
        `UPDATE orders SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
        [...keys.map((key) => updates[key]), req.params.id]
      );
    }

    if (body.status_id && body.status_id !== existingOrder[0].status_id) {
      await recordStatusChange({
        orderId: req.params.id,
        fromStatusId: existingOrder[0].status_id,
        toStatusId: body.status_id,
        changedBy: req.user.id,
        note: 'Updated from admin order form',
        connection
      });
      const [statusRows] = await connection.execute('SELECT name FROM order_statuses WHERE id = ?', [body.status_id]);
      if (statusRows[0]?.name === 'Completed') {
        await markOrderCommissionsPayable({ orderId: req.params.id, connection });
      }
    }

    if (body.assigned_employee_id && body.assigned_employee_id !== existingOrder[0].assigned_employee_id) {
      await recordCommissionAssignment({
        orderId: req.params.id,
        employeeId: body.assigned_employee_id,
        assignedBy: req.user.id,
        commissionAmount: body.commission_amount || 0,
        connection
      });
      await recordOrderAssignment({
        orderId: req.params.id,
        oldEmployeeId: existingOrder[0].assigned_employee_id,
        newEmployeeId: body.assigned_employee_id,
        assignedBy: req.user.id,
        assignedByRole: req.user.role,
        commissionAmount: body.commission_amount || 0,
        reason: 'Changed from admin order form',
        connection
      });
    }

    await connection.execute('INSERT INTO order_activity (order_id, employee_id, action, details) VALUES (?, ?, ?, ?)', [
      req.params.id,
      req.user.id,
      'Updated order',
      JSON.stringify(updates)
    ]);
    await connection.commit();

    const rows = await query(`${listSql} WHERE o.id = :id`, { id: req.params.id });
    res.json(rows[0]);
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

router.patch('/:id/status', authenticate, requireRole('admin', 'production'), async (req, res, next) => {
  try {
    const body = z.object({ status_id: z.number().int().positive(), note: z.string().optional() }).parse(req.body);
    const rows = await query('SELECT status_id, assigned_employee_id FROM orders WHERE id = :id', { id: req.params.id });
    if (!rows.length) return res.status(404).json({ message: 'Order not found.' });
    if (req.user.role === 'production' && rows[0].assigned_employee_id !== req.user.id) {
      return res.status(403).json({ message: 'This order is not assigned to you.' });
    }
    await query('UPDATE orders SET status_id = :status_id WHERE id = :id', { status_id: body.status_id, id: req.params.id });
    await recordStatusChange({
      orderId: req.params.id,
      fromStatusId: rows[0].status_id,
      toStatusId: body.status_id,
      changedBy: req.user.id,
      note: body.note || null
    });
    const status = await query('SELECT name FROM order_statuses WHERE id = :id', { id: body.status_id });
    if (status[0]?.name === 'Completed') {
      await markOrderCommissionsPayable({ orderId: req.params.id });
    }
    await query('INSERT INTO order_activity (order_id, employee_id, action, details) VALUES (:id, :employee, :action, :details)', {
      id: req.params.id,
      employee: req.user.id,
      action: 'Changed status',
      details: String(body.status_id)
    });
    res.json({ message: 'Status updated.' });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/assign', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const body = z.object({
      assigned_employee_id: z.number().int().positive().nullable(),
      commission_amount: z.number().nonnegative().optional()
    }).parse(req.body);
    const existing = await query('SELECT assigned_employee_id FROM orders WHERE id = :id', { id: req.params.id });
    await query('UPDATE orders SET assigned_employee_id = :employee WHERE id = :id', { employee: body.assigned_employee_id, id: req.params.id });
    await recordCommissionAssignment({
      orderId: req.params.id,
      employeeId: body.assigned_employee_id,
      assignedBy: req.user.id,
      commissionAmount: body.commission_amount || 0
    });
    await recordOrderAssignment({
      orderId: req.params.id,
      oldEmployeeId: existing[0]?.assigned_employee_id,
      newEmployeeId: body.assigned_employee_id,
      assignedBy: req.user.id,
      assignedByRole: req.user.role,
      commissionAmount: body.commission_amount || 0,
      reason: 'Changed assignee'
    });
    await query('INSERT INTO order_activity (order_id, employee_id, action, details) VALUES (:id, :employee, :action, :details)', {
      id: req.params.id,
      employee: req.user.id,
      action: 'Changed assignee',
      details: String(body.assigned_employee_id || 'Unassigned')
    });
    res.json({ message: 'Assignee updated.' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, requireOwner, async (req, res, next) => {
  try {
    await query('DELETE FROM orders WHERE id = :id', { id: req.params.id });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
