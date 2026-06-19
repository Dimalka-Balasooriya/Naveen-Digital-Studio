import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function phoneLocalVariant(value) {
  const digits = phoneDigits(value);
  if (digits.startsWith('94') && digits.length === 11) return `0${digits.slice(2)}`;
  return digits;
}

function phoneSqlExpression(alias = 'c') {
  return `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${alias}.phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')`;
}

function phoneMatchClause(alias = 'c') {
  const normalized = phoneSqlExpression(alias);
  return `(
    ${alias}.phone = :rawPhone
    OR ${normalized} = :phoneDigits
    OR ${normalized} = :phoneLocal
    OR ${normalized} LIKE :phoneTail
  )`;
}

function phoneParams(phone) {
  const digits = phoneDigits(phone);
  const local = phoneLocalVariant(phone);
  const tail = (digits || local).slice(-9);
  return {
    rawPhone: phone,
    phoneDigits: digits,
    phoneLocal: local,
    phoneTail: tail ? `%${tail}` : ''
  };
}

let hasCheckedOrderArchiveColumns = false;
async function ensureOrderArchiveSupport() {
  if (hasCheckedOrderArchiveColumns) return;
  await query(`CREATE TABLE IF NOT EXISTS courier_services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  const columns = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'orders'
       AND COLUMN_NAME IN ('deleted_at', 'deleted_by', 'is_deleted', 'archived_from_active_list', 'courier_service_id', 'tracking_number')`
  );
  const existing = new Set(columns.map((column) => column.COLUMN_NAME));
  if (!existing.has('deleted_at')) {
    await query('ALTER TABLE orders ADD COLUMN deleted_at TIMESTAMP NULL AFTER updated_at');
  }
  if (!existing.has('deleted_by')) {
    await query('ALTER TABLE orders ADD COLUMN deleted_by INT NULL AFTER deleted_at');
  }
  if (!existing.has('is_deleted')) {
    await query('ALTER TABLE orders ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE AFTER deleted_by');
  }
  if (!existing.has('archived_from_active_list')) {
    await query('ALTER TABLE orders ADD COLUMN archived_from_active_list BOOLEAN NOT NULL DEFAULT FALSE AFTER is_deleted');
  }
  if (!existing.has('courier_service_id')) {
    await query('ALTER TABLE orders ADD COLUMN courier_service_id INT NULL AFTER facebook_page_id');
  }
  if (!existing.has('tracking_number')) {
    await query('ALTER TABLE orders ADD COLUMN tracking_number VARCHAR(120) NULL AFTER courier_service_id');
  }
  hasCheckedOrderArchiveColumns = true;
}

router.get('/search', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    await ensureOrderArchiveSupport();
    const search = `%${req.query.q || ''}%`;
    const customers = await query(
      `SELECT id, name, phone, address, notes
       FROM customers
       WHERE name LIKE :search OR phone LIKE :search
       ORDER BY name
       LIMIT 10`,
      { search }
    );

    const uniqueCustomers = customers.filter((customer, index, list) => (
      list.findIndex((item) => phoneLocalVariant(item.phone).slice(-9) === phoneLocalVariant(customer.phone).slice(-9)) === index
    ));
    const results = await Promise.all(uniqueCustomers.map(async (customer) => ({
      ...customer,
      orders: await customerOrdersByPhone(customer.phone, req.user)
    })));

    res.json(results);
  } catch (error) {
    next(error);
  }
});

function orderVisibilitySql(user) {
  return { sql: '', params: {} };
}

async function customerOrders(customerId, user) {
  await ensureOrderArchiveSupport();
  const visibility = orderVisibilitySql(user);
  const orders = await query(
    `SELECT o.id, o.order_number, o.order_quantity, o.total_amount, o.advance_amount,
      o.created_at, o.updated_at, o.deleted_at, o.archived_from_active_list, o.tracking_number,
      p.name AS product_name, fp.name AS facebook_page_name, s.name AS status_name, cs.name AS courier_service_name,
      s.color AS status_color, employee.name AS assigned_employee_name,
      admin.name AS assigned_by_admin_name, oa.assigned_by_role
     FROM orders o
     JOIN products p ON p.id = o.product_id
     JOIN order_statuses s ON s.id = o.status_id
     LEFT JOIN facebook_pages fp ON fp.id = o.facebook_page_id
     LEFT JOIN courier_services cs ON cs.id = o.courier_service_id
     LEFT JOIN employees employee ON employee.id = o.assigned_employee_id
     LEFT JOIN order_assignments oa ON oa.order_id = o.id AND oa.is_current = TRUE
     LEFT JOIN employees admin ON admin.id = oa.assigned_by_admin_id
     WHERE o.customer_id = :customerId
     ${visibility.sql}
     ORDER BY o.created_at DESC`,
    { customerId, ...visibility.params }
  );
  return withStatusHistory(orders);
}

async function customerOrdersByPhone(phone, user) {
  await ensureOrderArchiveSupport();
  const visibility = orderVisibilitySql(user);
  const orders = await query(
    `SELECT o.id, o.order_number, o.order_quantity, o.total_amount, o.advance_amount,
      o.created_at, o.updated_at, o.deleted_at, o.archived_from_active_list, o.tracking_number,
      p.name AS product_name, fp.name AS facebook_page_name, s.name AS status_name, cs.name AS courier_service_name,
      s.color AS status_color, employee.name AS assigned_employee_name,
      admin.name AS assigned_by_admin_name, oa.assigned_by_role
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN products p ON p.id = o.product_id
     JOIN order_statuses s ON s.id = o.status_id
     LEFT JOIN facebook_pages fp ON fp.id = o.facebook_page_id
     LEFT JOIN courier_services cs ON cs.id = o.courier_service_id
     LEFT JOIN employees employee ON employee.id = o.assigned_employee_id
     LEFT JOIN order_assignments oa ON oa.order_id = o.id AND oa.is_current = TRUE
     LEFT JOIN employees admin ON admin.id = oa.assigned_by_admin_id
     WHERE ${phoneMatchClause('c')}
     ${visibility.sql}
     ORDER BY o.created_at DESC`,
    { ...phoneParams(phone), ...visibility.params }
  );
  return withStatusHistory(orders);
}

async function withStatusHistory(orders) {
  return Promise.all(orders.map(async (order) => {
    const status_history = await query(
      `SELECT h.id, h.changed_at, fs.name AS from_status_name, ts.name AS to_status_name,
        e.name AS changed_by_name, r.name AS changed_by_role
       FROM order_status_history h
       LEFT JOIN order_statuses fs ON fs.id = h.from_status_id
       JOIN order_statuses ts ON ts.id = h.to_status_id
       JOIN employees e ON e.id = h.changed_by
       JOIN roles r ON r.id = e.role_id
       WHERE h.order_id = :orderId
       ORDER BY h.changed_at ASC, h.id ASC`,
      { orderId: order.id }
    );
    return { ...order, status_history };
  }));
}

router.get('/by-whatsapp/:whatsapp', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, name, phone AS whatsapp_number, phone, address, notes, created_at, updated_at
       FROM customers
       WHERE ${phoneMatchClause('customers')}
       LIMIT 1`,
      phoneParams(req.params.whatsapp)
    );
    if (!rows.length) return res.status(404).json({ message: 'Customer profile not found for this WhatsApp number.' });
    res.json({ ...rows[0], orders: await customerOrdersByPhone(rows[0].phone, req.user) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/orders', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const customers = await query('SELECT id, name, phone AS whatsapp_number, phone, address, notes FROM customers WHERE id = :id', { id: req.params.id });
    if (!customers.length) return res.status(404).json({ message: 'Customer not found.' });
    res.json({ ...customers[0], orders: await customerOrdersByPhone(customers[0].phone, req.user) });
  } catch (error) {
    next(error);
  }
});

export default router;
