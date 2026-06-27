import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { createOrderNumber, ensureOrderTasks } from '../utils/orders.js';
import {
  applyOrderStatusWorkflow,
  cancelOrderCommissions,
  ensureStatusWorkflowSupport,
  isCompleteStatusName,
  recordOrderAssignment,
  recordStatusChange,
  upsertCompletionCommission
} from '../utils/tracking.js';

const router = Router();

const orderSchema = z.object({
  customer_name: z.string().min(2),
  customer_phone: z.string().min(6),
  customer_address: z.string().optional().nullable(),
  customer_notes: z.string().optional().nullable(),
  product_id: z.number().int().positive().optional().nullable(),
  product_name: z.string().min(2).optional().nullable(),
  custom_product_name: z.string().min(2).optional().nullable(),
  facebook_page_id: z.number().int().positive().optional().nullable(),
  courier_service_id: z.number().int().positive().optional().nullable(),
  tracking_number: z.string().max(120).optional().nullable(),
  status_id: z.number().int().positive(),
  assigned_employee_id: z.number().int().positive().optional().nullable(),
  commission_amount: z.number().nonnegative().optional(),
  production_commission_amount: z.number().nonnegative().optional(),
  co_admin_commission_amount: z.number().nonnegative().optional(),
  co_admin_id: z.number().int().positive().optional().nullable(),
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
    p.name AS product_name, fp.name AS facebook_page_name, fp.whatsapp_number AS facebook_page_whatsapp_number,
    cs.name AS courier_service_name,
    s.name AS status_name, s.color AS status_color,
    e.name AS assigned_employee_name, cc.commission_amount AS current_commission_amount,
    co_cc.employee_id AS current_co_admin_id, co_cc.commission_amount AS current_co_admin_commission_amount
  FROM orders o
  JOIN customers c ON c.id = o.customer_id
  JOIN products p ON p.id = o.product_id
  LEFT JOIN facebook_pages fp ON fp.id = o.facebook_page_id
  LEFT JOIN courier_services cs ON cs.id = o.courier_service_id
  JOIN order_statuses s ON s.id = o.status_id
  LEFT JOIN employees e ON e.id = o.assigned_employee_id
  LEFT JOIN commissions cc ON cc.id = (
    SELECT active_commission.id
    FROM commissions active_commission
    WHERE active_commission.order_id = o.id AND active_commission.is_active = TRUE AND active_commission.commission_type = 'PRODUCTION'
    ORDER BY active_commission.assignment_started_at DESC, active_commission.id DESC
    LIMIT 1
  )
  LEFT JOIN commissions co_cc ON co_cc.id = (
    SELECT active_co_commission.id
    FROM commissions active_co_commission
    WHERE active_co_commission.order_id = o.id AND active_co_commission.is_active = TRUE AND active_co_commission.commission_type = 'CO_ADMIN'
    ORDER BY active_co_commission.assignment_started_at DESC, active_co_commission.id DESC
    LIMIT 1
  )
`;

let hasCheckedFacebookPageColumn = false;
async function ensureFacebookPageWhatsAppColumn() {
  if (hasCheckedFacebookPageColumn) return;
  const columns = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'facebook_pages'
       AND COLUMN_NAME = 'whatsapp_number'`
  );
  if (!columns.length) {
    await query('ALTER TABLE facebook_pages ADD COLUMN whatsapp_number VARCHAR(30) NULL AFTER name');
  }
  hasCheckedFacebookPageColumn = true;
}

let hasCheckedOrderArchiveColumns = false;
async function ensureOrderArchiveSupport({ connection = null } = {}) {
  if (hasCheckedOrderArchiveColumns) return;
  const runner = connection
    ? async (sql, params = []) => {
      const [rows] = await connection.execute(sql, params);
      return rows;
    }
    : query;

  await runner(`CREATE TABLE IF NOT EXISTS courier_services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    phone VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  const columns = await runner(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'orders'
       AND COLUMN_NAME IN ('deleted_at', 'deleted_by', 'is_deleted', 'archived_from_active_list', 'assigned_co_admin_id', 'courier_service_id', 'tracking_number')`
  );
  const existing = new Set(columns.map((column) => column.COLUMN_NAME));
  if (!existing.has('deleted_at')) {
    await runner('ALTER TABLE orders ADD COLUMN deleted_at TIMESTAMP NULL AFTER updated_at');
  }
  if (!existing.has('deleted_by')) {
    await runner('ALTER TABLE orders ADD COLUMN deleted_by INT NULL AFTER deleted_at');
  }
  if (!existing.has('is_deleted')) {
    await runner('ALTER TABLE orders ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE AFTER deleted_by');
  }
  if (!existing.has('archived_from_active_list')) {
    await runner('ALTER TABLE orders ADD COLUMN archived_from_active_list BOOLEAN NOT NULL DEFAULT FALSE AFTER is_deleted');
  }
  if (!existing.has('assigned_co_admin_id')) {
    await runner('ALTER TABLE orders ADD COLUMN assigned_co_admin_id INT NULL AFTER assigned_employee_id');
  }
  if (!existing.has('courier_service_id')) {
    await runner('ALTER TABLE orders ADD COLUMN courier_service_id INT NULL AFTER facebook_page_id');
  }
  if (!existing.has('tracking_number')) {
    await runner('ALTER TABLE orders ADD COLUMN tracking_number VARCHAR(120) NULL AFTER courier_service_id');
  }
  hasCheckedOrderArchiveColumns = true;
}

function addOrderVisibilityFilter(filters, params, user, options = {}) {
  if (user?.role !== 'CO_ADMIN' && user?.role !== 'PRODUCTION_EMPLOYEE') return;
  if (user?.role === 'CO_ADMIN' && !options.assignedOnly) return;
  filters.push(`(
    o.assigned_employee_id = :currentUserId
    OR o.assigned_co_admin_id = :currentUserId
    OR EXISTS (
      SELECT 1 FROM commissions visible_commission
      WHERE visible_commission.order_id = o.id
        AND visible_commission.employee_id = :currentUserId
    )
  )`);
  params.currentUserId = user.id;
}

async function resolveProductId(body, connection) {
  if (body.product_id) return body.product_id;
  const productName = String(body.product_name || body.custom_product_name || '').trim();
  if (!productName) {
    const error = new Error('Select a product or enter a custom product name.');
    error.status = 400;
    throw error;
  }
  const [existing] = await connection.execute('SELECT id, is_active FROM products WHERE name = ? LIMIT 1', [productName]);
  if (existing.length) {
    if (!existing[0].is_active) {
      await connection.execute('UPDATE products SET is_active = TRUE WHERE id = ?', [existing[0].id]);
    }
    return existing[0].id;
  }
  const [created] = await connection.execute('INSERT INTO products (name, is_active) VALUES (?, TRUE)', [productName]);
  return created.insertId;
}

async function findOrCreateCustomer(body, connection) {
  const phone = String(body.customer_phone || '').trim();
  const [existing] = await connection.execute('SELECT id FROM customers WHERE phone = ? LIMIT 1', [phone]);
  if (existing.length) {
    await connection.execute(
      'UPDATE customers SET name = ?, address = ?, notes = ? WHERE id = ?',
      [body.customer_name, body.customer_address || null, body.customer_notes || null, existing[0].id]
    );
    return existing[0].id;
  }

  try {
    const [customerResult] = await connection.execute(
      'INSERT INTO customers (name, phone, address, notes) VALUES (?, ?, ?, ?)',
      [body.customer_name, phone, body.customer_address || null, body.customer_notes || null]
    );
    return customerResult.insertId;
  } catch (error) {
    if (error?.code !== 'ER_DUP_ENTRY') throw error;
    const [duplicateRows] = await connection.execute('SELECT id FROM customers WHERE phone = ? LIMIT 1', [phone]);
    if (!duplicateRows.length) throw error;
    await connection.execute(
      'UPDATE customers SET name = ?, address = ?, notes = ? WHERE id = ?',
      [body.customer_name, body.customer_address || null, body.customer_notes || null, duplicateRows[0].id]
    );
    return duplicateRows[0].id;
  }
}

async function updateOrderCustomer({ orderId, body, connection }) {
  const [orders] = await connection.execute('SELECT customer_id FROM orders WHERE id = ?', [orderId]);
  if (!orders.length) return false;

  const currentCustomerId = orders[0].customer_id;
  const nextPhone = body.customer_phone ? String(body.customer_phone).trim() : null;

  if (nextPhone) {
    const [matchingCustomers] = await connection.execute('SELECT id FROM customers WHERE phone = ? LIMIT 1', [nextPhone]);
    if (matchingCustomers.length && Number(matchingCustomers[0].id) !== Number(currentCustomerId)) {
      await connection.execute('UPDATE orders SET customer_id = ? WHERE id = ?', [matchingCustomers[0].id, orderId]);
      await connection.execute(
        `UPDATE customers
         SET name = COALESCE(?, name),
             address = ?,
             notes = ?
         WHERE id = ?`,
        [
          body.customer_name || null,
          body.customer_address ?? null,
          body.customer_notes ?? null,
          matchingCustomers[0].id
        ]
      );
      return true;
    }
  }

  await connection.execute(
    `UPDATE customers SET
      name = COALESCE(?, name),
      phone = COALESCE(?, phone),
      address = ?,
      notes = ?
     WHERE id = ?`,
    [
      body.customer_name || null,
      nextPhone,
      body.customer_address ?? null,
      body.customer_notes ?? null,
      currentCustomerId
    ]
  );
  return true;
}

async function insertOrderWithUniqueNumber({ connection, body, customerId, productId, userId }) {
  let lastDuplicateError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const orderNumber = await createOrderNumber(connection);
    try {
      const [orderResult] = await connection.execute(
        `INSERT INTO orders (
          order_number, customer_id, product_id, facebook_page_id, courier_service_id, tracking_number, status_id, assigned_employee_id, assigned_co_admin_id,
          needed_date, is_fast, quantity, order_quantity, total_amount, advance_amount, design_notes, return_reason, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderNumber,
          customerId,
          productId,
          body.facebook_page_id || null,
          body.courier_service_id || null,
          body.tracking_number || null,
          body.status_id,
          body.assigned_employee_id || null,
          body.co_admin_id || null,
          body.needed_date,
          body.is_fast || false,
          body.order_quantity || body.quantity || 1,
          body.order_quantity || body.quantity || 1,
          body.total_amount || 0,
          body.advance_amount || 0,
          body.design_notes || null,
          body.return_reason || null,
          userId
        ]
      );
      return { orderId: orderResult.insertId, orderNumber };
    } catch (error) {
      const isOrderNumberDuplicate = error?.code === 'ER_DUP_ENTRY' && String(error.sqlMessage || '').includes('order_number');
      if (!isOrderNumberDuplicate) throw error;
      lastDuplicateError = error;
    }
  }
  const error = new Error('Could not create a unique order number. Please try saving again.');
  error.status = 409;
  error.cause = lastDuplicateError;
  throw error;
}

let hasCheckedBillTable = false;

async function ensureBillTable({ connection = null } = {}) {
  if (hasCheckedBillTable) return;

  const sql = `CREATE TABLE IF NOT EXISTS order_bills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    manual_price DECIMAL(10,2) NOT NULL,
    generated_by_id INT NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_order_bills_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_bills_generated_by FOREIGN KEY (generated_by_id) REFERENCES employees(id),
    INDEX idx_order_bills_order (order_id),
    INDEX idx_order_bills_generated_at (generated_at)
  )`;

  if (connection) {
    await connection.execute(sql);
  } else {
    await query(sql);
  }

  hasCheckedBillTable = true;
}

async function getBillPreview(orderId, billId = null) {
  await ensureBillTable();
  await ensureFacebookPageWhatsAppColumn();
  const orders = await query(
    `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address,
      p.name AS product_name, fp.name AS facebook_page_name, fp.whatsapp_number AS facebook_page_whatsapp_number,
      cs.name AS courier_service_name,
      s.name AS status_name, s.color AS status_color,
      e.name AS assigned_employee_name, er.name AS assigned_employee_role
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN products p ON p.id = o.product_id
     LEFT JOIN facebook_pages fp ON fp.id = o.facebook_page_id
     LEFT JOIN courier_services cs ON cs.id = o.courier_service_id
     JOIN order_statuses s ON s.id = o.status_id
     LEFT JOIN employees e ON e.id = o.assigned_employee_id
     LEFT JOIN roles er ON er.id = e.role_id
     WHERE o.id = :orderId`,
    { orderId }
  );
  if (!orders.length) return null;

  const billFilter = billId ? 'AND b.id = :billId' : '';
  const [bills, assignmentHistory, statusHistory] = await Promise.all([
    query(
      `SELECT b.*, e.name AS generated_by_name, r.name AS generated_by_role
       FROM order_bills b
       JOIN employees e ON e.id = b.generated_by_id
       JOIN roles r ON r.id = e.role_id
       WHERE b.order_id = :orderId ${billFilter}
       ORDER BY b.generated_at DESC`,
      { orderId, billId }
    ),
    query(
      `SELECT ah.*, assigned.name AS assigned_employee_name, assigned_role.name AS assigned_employee_role,
        admin.name AS assigned_by_name, admin_role.name AS assigned_by_role
       FROM assignment_history ah
       JOIN employees assigned ON assigned.id = ah.new_employee_id
       JOIN roles assigned_role ON assigned_role.id = assigned.role_id
       JOIN employees admin ON admin.id = ah.changed_by_admin_id
       JOIN roles admin_role ON admin_role.id = admin.role_id
       WHERE ah.order_id = :orderId
       ORDER BY ah.changed_at ASC, ah.id ASC`,
      { orderId }
    ),
    query(
      `SELECT h.*, old_status.name AS old_status_name, new_status.name AS new_status_name,
        changed_by.name AS changed_by_name, changed_role.name AS changed_by_role
       FROM order_status_history h
       LEFT JOIN order_statuses old_status ON old_status.id = h.from_status_id
       JOIN order_statuses new_status ON new_status.id = h.to_status_id
       JOIN employees changed_by ON changed_by.id = h.changed_by
       JOIN roles changed_role ON changed_role.id = changed_by.role_id
       WHERE h.order_id = :orderId
       ORDER BY h.changed_at ASC, h.id ASC`,
      { orderId }
    )
  ]);

  return {
    order: orders[0],
    bill: bills[0] || null,
    bills,
    assignmentHistory,
    statusHistory
  };
}

router.get('/', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    await ensureStatusWorkflowSupport();
    await ensureFacebookPageWhatsAppColumn();
    await ensureOrderArchiveSupport();
    const filters = [
      'COALESCE(o.archived_from_active_list, FALSE) = FALSE',
      "LOWER(s.name) NOT IN ('cancel', 'cancelled', 'canceled')"
    ];
    const params = {};

    if (req.query.search) {
      filters.push('(o.order_number LIKE :search OR c.name LIKE :search OR c.phone LIKE :search)');
      params.search = `%${req.query.search}%`;
    }
    if (req.query.status_id) {
      filters.push('o.status_id = :status_id');
      params.status_id = req.query.status_id;
    }
    if (req.query.status) {
      filters.push('s.name = :status_name');
      params.status_name = req.query.status;
    }
    if (req.query.fast === 'true') {
      filters.push('o.is_fast = TRUE');
    }
    addOrderVisibilityFilter(filters, params, req.user, { assignedOnly: req.query.assigned_only === 'true' });

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const orders = await query(`${listSql} ${where} ORDER BY o.is_fast DESC, o.needed_date ASC, o.created_at DESC`, params);
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    await ensureStatusWorkflowSupport();
    await ensureFacebookPageWhatsAppColumn();
    await ensureOrderArchiveSupport();
    const detailFilters = ['o.id = :id'];
    const detailParams = { id: req.params.id };
    addOrderVisibilityFilter(detailFilters, detailParams, req.user);
    const rows = await query(`${listSql} WHERE ${detailFilters.join(' AND ')}`, detailParams);
    if (!rows.length) return res.status(404).json({ message: 'Order not found.' });

    if (req.user.role === 'PRODUCTION_EMPLOYEE' && rows[0].assigned_employee_id !== req.user.id) {
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
    await ensureBillTable();
    const [history, commissions, assignmentHistory, bills] = await Promise.all([
      query(
        `SELECT h.*, fs.name AS from_status_name, ts.name AS to_status_name, e.name AS changed_by_name, r.name AS changed_by_role
         FROM order_status_history h
         LEFT JOIN order_statuses fs ON fs.id = h.from_status_id
         JOIN order_statuses ts ON ts.id = h.to_status_id
         JOIN employees e ON e.id = h.changed_by
         JOIN roles r ON r.id = e.role_id
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
          new_role.name AS new_employee_role, admin.name AS changed_by_name, admin_role.name AS changed_by_role
         FROM assignment_history ah
         LEFT JOIN employees old_e ON old_e.id = ah.old_employee_id
         JOIN employees new_e ON new_e.id = ah.new_employee_id
         JOIN roles new_role ON new_role.id = new_e.role_id
         JOIN employees admin ON admin.id = ah.changed_by_admin_id
         JOIN roles admin_role ON admin_role.id = admin.role_id
         WHERE ah.order_id = :id
         ORDER BY ah.changed_at DESC`,
        { id: req.params.id }
      ),
      query(
        `SELECT b.*, e.name AS generated_by_name
         FROM order_bills b
         JOIN employees e ON e.id = b.generated_by_id
         WHERE b.order_id = :id
         ORDER BY b.generated_at DESC`,
        { id: req.params.id }
      )
    ]);
    res.json({ ...rows[0], tasks, history, commissions, assignmentHistory, bills });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, requireRole('admin'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const body = orderSchema.parse(req.body);
    await connection.beginTransaction();
    await ensureOrderArchiveSupport({ connection });

    const customerId = await findOrCreateCustomer(body, connection);
    const productId = await resolveProductId(body, connection);
    const { orderId, orderNumber } = await insertOrderWithUniqueNumber({
      connection,
      body,
      customerId,
      productId,
      userId: req.user.id
    });

    await connection.execute('INSERT INTO order_activity (order_id, employee_id, action, details) VALUES (?, ?, ?, ?)', [
      orderId,
      req.user.id,
      'Created order',
      orderNumber
    ]);
    await recordStatusChange({
      orderId,
      fromStatusId: null,
      toStatusId: body.status_id,
      changedBy: req.user.id,
      note: 'Order created',
      connection
    });
    await recordOrderAssignment({
      orderId,
      newEmployeeId: body.assigned_employee_id,
      assignedBy: req.user.id,
      assignedByRole: req.user.role,
      commissionAmount: 0,
      reason: 'Initial order assignment',
      connection
    });
    const workflowMessage = await applyOrderStatusWorkflow({ orderId, statusId: body.status_id, connection });
    await connection.commit();
    await ensureOrderTasks(orderId);

    await ensureFacebookPageWhatsAppColumn();
    const rows = await query(`${listSql} WHERE o.id = :id`, { id: orderId });
    res.status(201).json({ ...rows[0], message: workflowMessage || 'Order created.' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

router.post('/:orderId/generate-bill', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    await ensureBillTable();
    const body = z.object({
      manual_price: z.number({ required_error: 'Manual price is required.' }).positive('Manual price must be greater than 0.')
    }).parse(req.body);

    const orders = await query('SELECT id FROM orders WHERE id = :id', { id: req.params.orderId });
    if (!orders.length) return res.status(404).json({ message: 'Order not found.' });

    const result = await query(
      `INSERT INTO order_bills (order_id, manual_price, generated_by_id)
       VALUES (:order_id, :manual_price, :generated_by_id)`,
      {
        order_id: req.params.orderId,
        manual_price: body.manual_price,
        generated_by_id: req.user.id
      }
    );

    await query(
      `INSERT INTO order_activity (order_id, employee_id, action, details)
       VALUES (:order_id, :employee_id, :action, :details)`,
      {
        order_id: req.params.orderId,
        employee_id: req.user.id,
        action: 'Generated bill',
        details: `Manual price Rs. ${body.manual_price}`
      }
    );

    const rows = await query(
      `SELECT b.*, e.name AS generated_by_name
       FROM order_bills b
       JOIN employees e ON e.id = b.generated_by_id
       WHERE b.id = :id`,
      { id: result.insertId }
    );

    const preview = await getBillPreview(req.params.orderId, result.insertId);
    res.status(201).json({ message: 'Bill generated successfully.', bill: rows[0], preview });
  } catch (error) {
    next(error);
  }
});

async function getCompletionCommissionCandidates(orderId, connection = null) {
  const runner = connection
    ? async (sql, params = []) => {
      const [rows] = await connection.execute(sql, params);
      return rows;
    }
    : (sql, params) => query(sql, params);

  const rows = await runner(
    `SELECT candidate.id AS employee_id, candidate.name AS employee_name, role_table.name AS user_role,
        CASE WHEN role_table.name = 'CO_ADMIN' THEN 'CO_ADMIN' ELSE 'PRODUCTION' END AS commission_type,
        latest.commission_amount AS existing_commission_amount,
        latest.id AS existing_commission_id
     FROM (
       SELECT o.assigned_employee_id AS employee_id
       FROM orders o
       WHERE o.id = ? AND o.assigned_employee_id IS NOT NULL
       UNION
       SELECT ah.new_employee_id AS employee_id
       FROM assignment_history ah
       WHERE ah.order_id = ?
       UNION
       SELECT o.assigned_co_admin_id AS employee_id
       FROM orders o
       WHERE o.id = ? AND o.assigned_co_admin_id IS NOT NULL
       UNION
       SELECT o.created_by AS employee_id
       FROM orders o
       JOIN employees creator ON creator.id = o.created_by
       JOIN roles creator_role ON creator_role.id = creator.role_id
       WHERE o.id = ? AND creator_role.name = 'CO_ADMIN'
       UNION
       SELECT c.employee_id
       FROM commissions c
       WHERE c.order_id = ? AND c.commission_type = 'CO_ADMIN'
     ) people
     JOIN employees candidate ON candidate.id = people.employee_id
     JOIN roles role_table ON role_table.id = candidate.role_id
     LEFT JOIN commissions latest ON latest.id = (
       SELECT c2.id
       FROM commissions c2
       WHERE c2.order_id = ?
         AND c2.employee_id = candidate.id
         AND c2.commission_type = CASE WHEN role_table.name = 'CO_ADMIN' THEN 'CO_ADMIN' ELSE 'PRODUCTION' END
         AND c2.cancelled_at IS NULL
       ORDER BY c2.id DESC
       LIMIT 1
     )
     WHERE role_table.name IN ('CO_ADMIN', 'PRODUCTION_EMPLOYEE')
     ORDER BY FIELD(role_table.name, 'PRODUCTION_EMPLOYEE', 'CO_ADMIN'), candidate.name`,
    [orderId, orderId, orderId, orderId, orderId, orderId]
  );

  return rows;
}

router.get('/:id/completion-commissions', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const detailFilters = ['o.id = :id'];
    const detailParams = { id: req.params.id };
    addOrderVisibilityFilter(detailFilters, detailParams, req.user);
    const rows = await query(`${listSql} WHERE ${detailFilters.join(' AND ')}`, detailParams);
    if (!rows.length) return res.status(404).json({ message: 'Order not found.' });

    const candidates = await getCompletionCommissionCandidates(req.params.id);
    res.json({ order: rows[0], candidates });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/complete', authenticate, requireRole('admin'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const body = z.object({
      status_id: z.number().int().positive(),
      commissions: z.array(z.object({
        employee_id: z.number().int().positive(),
        commission_amount: z.number().nonnegative(),
        commission_type: z.enum(['PRODUCTION', 'CO_ADMIN']).optional(),
        user_role: z.string().optional().nullable()
      })).optional().default([]),
      note: z.string().optional()
    }).parse(req.body);

    await connection.beginTransaction();
    await ensureOrderArchiveSupport({ connection });
    await ensureStatusWorkflowSupport({ connection });

    const [statusRows] = await connection.execute('SELECT name FROM order_statuses WHERE id = ?', [body.status_id]);
    if (!statusRows.length || !isCompleteStatusName(statusRows[0].name)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Selected status is not a complete status.' });
    }

    const [orders] = await connection.execute(
      `SELECT o.id, o.status_id
       FROM orders o
       WHERE o.id = ?`,
      [req.params.id]
    );
    if (!orders.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Order not found.' });
    }

    if (req.user.role === 'CO_ADMIN') {
      const [allowed] = await connection.execute(
        `SELECT o.id
         FROM orders o
         WHERE o.id = ?
           AND (
             o.created_by = ?
             OR EXISTS (
               SELECT 1 FROM commissions visible_commission
               WHERE visible_commission.order_id = o.id AND visible_commission.employee_id = ?
             )
           )`,
        [req.params.id, req.user.id, req.user.id]
      );
      if (!allowed.length) {
        await connection.rollback();
        return res.status(403).json({ message: 'You cannot complete this order.' });
      }
    }

    const candidates = await getCompletionCommissionCandidates(req.params.id, connection);
    const candidateKeys = new Map(candidates.map((item) => [
      `${item.employee_id}-${item.commission_type}`,
      item
    ]));

    for (const commission of body.commissions) {
      const commissionType = commission.commission_type || 'PRODUCTION';
      const key = `${commission.employee_id}-${commissionType}`;
      const candidate = candidateKeys.get(key);
      if (!candidate) {
        await connection.rollback();
        return res.status(400).json({ message: 'Commission includes a user who is not assigned or related to this order.' });
      }

      await upsertCompletionCommission({
        orderId: req.params.id,
        employeeId: commission.employee_id,
        assignedBy: req.user.id,
        commissionAmount: commission.commission_amount,
        userRole: commission.user_role || candidate.user_role,
        commissionType,
        connection
      });
    }

    await connection.execute('UPDATE orders SET status_id = ? WHERE id = ?', [body.status_id, req.params.id]);
    await recordStatusChange({
      orderId: req.params.id,
      fromStatusId: orders[0].status_id,
      toStatusId: body.status_id,
      changedBy: req.user.id,
      note: body.note || 'Completed with manual commission workflow',
      connection
    });
    await connection.execute(
      'INSERT INTO order_activity (order_id, employee_id, action, details) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, 'Completed order', `${body.commissions.length} commission record(s) saved`]
    );

    await connection.commit();
    res.json({ message: body.commissions.length ? 'Commission saved and order completed.' : 'Order completed without commission.' });
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
    await ensureOrderArchiveSupport({ connection });

    if (body.customer_name || body.customer_phone || body.customer_address !== undefined || body.customer_notes !== undefined) {
      const updatedCustomer = await updateOrderCustomer({ orderId: req.params.id, body, connection });
      if (!updatedCustomer) return res.status(404).json({ message: 'Order not found.' });
    }

    const [existingOrder] = await connection.execute('SELECT status_id, assigned_employee_id FROM orders WHERE id = ?', [req.params.id]);
    if (!existingOrder.length) return res.status(404).json({ message: 'Order not found.' });

    if (body.order_quantity && !body.quantity) {
      body.quantity = body.order_quantity;
    }

    if (!body.product_id && (body.product_name || body.custom_product_name)) {
      body.product_id = await resolveProductId(body, connection);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'co_admin_id')) {
      body.assigned_co_admin_id = body.co_admin_id || null;
    }

    const allowed = ['product_id', 'facebook_page_id', 'courier_service_id', 'tracking_number', 'status_id', 'assigned_employee_id', 'assigned_co_admin_id', 'needed_date', 'is_fast', 'quantity', 'order_quantity', 'total_amount', 'advance_amount', 'design_notes', 'return_reason'];
    const updates = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
    const keys = Object.keys(updates);
    let workflowMessage = null;

    if (keys.length) {
      await connection.execute(
        `UPDATE orders SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
        [...keys.map((key) => updates[key]), req.params.id]
      );
    }

    const hasAssignedEmployee = Object.prototype.hasOwnProperty.call(body, 'assigned_employee_id');
    const nextEmployeeId = body.assigned_employee_id || null;
    const previousEmployeeId = existingOrder[0].assigned_employee_id || null;
    const assigneeChanged = hasAssignedEmployee && Number(nextEmployeeId || 0) !== Number(previousEmployeeId || 0);
    if (assigneeChanged && !nextEmployeeId) {
      await connection.execute(
        `UPDATE order_assignments
         SET is_current = FALSE, assignment_ended_at = NOW()
         WHERE order_id = ? AND task_id IS NULL AND is_current = TRUE`,
        [req.params.id]
      );
    } else if (assigneeChanged && nextEmployeeId) {
      await recordOrderAssignment({
        orderId: req.params.id,
        oldEmployeeId: previousEmployeeId,
        newEmployeeId: nextEmployeeId,
        assignedBy: req.user.id,
        assignedByRole: req.user.role,
        commissionAmount: 0,
        reason: 'Changed from admin order form',
        connection
      });
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
      workflowMessage = await applyOrderStatusWorkflow({ orderId: req.params.id, statusId: body.status_id, connection });
    }

    await connection.execute('INSERT INTO order_activity (order_id, employee_id, action, details) VALUES (?, ?, ?, ?)', [
      req.params.id,
      req.user.id,
      'Updated order',
      JSON.stringify(updates)
    ]);
    await connection.commit();

    await ensureFacebookPageWhatsAppColumn();
    const rows = await query(`${listSql} WHERE o.id = :id`, { id: req.params.id });
    res.json({ ...rows[0], message: workflowMessage || 'Order updated.' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

router.patch('/:id/status', authenticate, requireRole('admin', 'production'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const body = z.object({ status_id: z.number().int().positive(), note: z.string().optional() }).parse(req.body);
    await connection.beginTransaction();
    await ensureOrderArchiveSupport({ connection });
    const [rows] = await connection.execute(
      `SELECT o.status_id, o.assigned_employee_id,
        EXISTS (
          SELECT 1 FROM assignment_history visible_history
          WHERE visible_history.order_id = o.id
            AND (visible_history.new_employee_id = ? OR visible_history.old_employee_id = ?)
        ) AS has_history_access,
        EXISTS (
          SELECT 1 FROM order_assignments visible_assignment
          WHERE visible_assignment.order_id = o.id
            AND visible_assignment.assigned_to_employee_id = ?
        ) AS has_assignment_access
       FROM orders o
       WHERE o.id = ?`,
      [req.user.id, req.user.id, req.user.id, req.params.id]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Order not found.' });
    }
    if (req.user.role === 'PRODUCTION_EMPLOYEE'
      && rows[0].assigned_employee_id !== req.user.id
      && !Number(rows[0].has_history_access)
      && !Number(rows[0].has_assignment_access)) {
      await connection.rollback();
      return res.status(403).json({ message: 'This order is not assigned to you.' });
    }
    await connection.execute('UPDATE orders SET status_id = ? WHERE id = ?', [body.status_id, req.params.id]);
    await recordStatusChange({
      orderId: req.params.id,
      fromStatusId: rows[0].status_id,
      toStatusId: body.status_id,
      changedBy: req.user.id,
      note: body.note || null,
      connection
    });
    const workflowMessage = await applyOrderStatusWorkflow({ orderId: req.params.id, statusId: body.status_id, connection });
    await connection.execute(
      'INSERT INTO order_activity (order_id, employee_id, action, details) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, 'Changed status', String(body.status_id)]
    );
    await connection.commit();
    res.json({ message: workflowMessage || 'Status updated.' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

router.patch('/:id/assign', authenticate, requireRole('admin'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const body = z.object({
      assigned_employee_id: z.number().int().positive().nullable(),
      commission_amount: z.number().nonnegative().optional()
    }).parse(req.body);
    await connection.beginTransaction();
    await ensureOrderArchiveSupport({ connection });
    const [existing] = await connection.execute('SELECT assigned_employee_id FROM orders WHERE id = ?', [req.params.id]);
    if (!existing.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Order not found.' });
    }
    const previousEmployeeId = existing[0]?.assigned_employee_id || null;
    const nextEmployeeId = body.assigned_employee_id || null;
    const assigneeChanged = Number(previousEmployeeId || 0) !== Number(nextEmployeeId || 0);

    await connection.execute('UPDATE orders SET assigned_employee_id = ? WHERE id = ?', [nextEmployeeId, req.params.id]);

    if (assigneeChanged && nextEmployeeId) {
      await recordOrderAssignment({
        orderId: req.params.id,
        oldEmployeeId: previousEmployeeId,
        newEmployeeId: nextEmployeeId,
        assignedBy: req.user.id,
        assignedByRole: req.user.role,
        commissionAmount: 0,
        reason: 'Changed assignee',
        connection
      });
    } else if (assigneeChanged) {
      await connection.execute(
        `UPDATE order_assignments
         SET is_current = FALSE, assignment_ended_at = NOW()
         WHERE order_id = ? AND task_id IS NULL AND is_current = TRUE`,
        [req.params.id]
      );
    }

    await connection.execute(
      'INSERT INTO order_activity (order_id, employee_id, action, details) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, 'Changed assignee', String(nextEmployeeId || 'Unassigned')]
    );
    await connection.commit();
    res.json({ message: 'Assignee updated.' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

router.delete('/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensureOrderArchiveSupport({ connection });
    const [orders] = await connection.execute(
      `SELECT id
       FROM orders
       WHERE id = ?`,
      [req.params.id]
    );
    if (!orders.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Order not found.' });
    }
    await connection.execute(
      `UPDATE orders
       SET deleted_at = COALESCE(deleted_at, NOW()),
           deleted_by = COALESCE(deleted_by, ?),
           is_deleted = TRUE,
           archived_from_active_list = TRUE
       WHERE id = ?`,
      [req.user.id, req.params.id]
    );
    await cancelOrderCommissions({ orderId: req.params.id, reason: 'Order deleted', connection });
    await connection.execute(
      'INSERT INTO order_activity (order_id, employee_id, action, details) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, 'Archived order', 'Removed from active order list']
    );
    await connection.commit();
    res.json({ message: 'Order removed from active list. It remains in customer history and reports.' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

export default router;
