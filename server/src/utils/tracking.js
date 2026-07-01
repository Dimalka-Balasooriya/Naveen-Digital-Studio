import { query } from '../config/db.js';

let hasCheckedWorkflowColumns = false;

async function run(connection, sql, params = []) {
  if (connection) {
    const [rows] = await connection.execute(sql, params);
    return rows;
  }
  return query(sql, params);
}

export async function ensureStatusWorkflowSupport({ connection = null } = {}) {
  if (!hasCheckedWorkflowColumns) {
    const cancelledReasonRows = await run(
      connection,
      `SELECT COUNT(*) AS column_count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'commissions'
         AND COLUMN_NAME = 'cancelled_reason'`
    );
    if (!Number(cancelledReasonRows[0]?.column_count || 0)) {
      await run(connection, 'ALTER TABLE commissions ADD COLUMN cancelled_reason VARCHAR(255) NULL AFTER paid_at');
    }

    const cancelledAtRows = await run(
      connection,
      `SELECT COUNT(*) AS column_count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'commissions'
         AND COLUMN_NAME = 'cancelled_at'`
    );
    if (!Number(cancelledAtRows[0]?.column_count || 0)) {
      await run(connection, 'ALTER TABLE commissions ADD COLUMN cancelled_at TIMESTAMP NULL AFTER cancelled_reason');
    }

    const paidAmountRows = await run(
      connection,
      `SELECT COUNT(*) AS column_count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'commissions'
         AND COLUMN_NAME = 'paid_amount'`
    );
    if (!Number(paidAmountRows[0]?.column_count || 0)) {
      await run(connection, 'ALTER TABLE commissions ADD COLUMN paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER paid_at');
    }

    const paymentNotesRows = await run(
      connection,
      `SELECT COUNT(*) AS column_count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'commissions'
         AND COLUMN_NAME = 'payment_notes'`
    );
    if (!Number(paymentNotesRows[0]?.column_count || 0)) {
      await run(connection, 'ALTER TABLE commissions ADD COLUMN payment_notes VARCHAR(255) NULL AFTER paid_amount');
    }

    const userRoleRows = await run(
      connection,
      `SELECT COUNT(*) AS column_count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'commissions'
         AND COLUMN_NAME = 'user_role'`
    );
    if (!Number(userRoleRows[0]?.column_count || 0)) {
      await run(connection, 'ALTER TABLE commissions ADD COLUMN user_role VARCHAR(50) NULL AFTER employee_id');
    }

    const commissionTypeRows = await run(
      connection,
      `SELECT COUNT(*) AS column_count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'commissions'
         AND COLUMN_NAME = 'commission_type'`
    );
    if (!Number(commissionTypeRows[0]?.column_count || 0)) {
      await run(connection, "ALTER TABLE commissions ADD COLUMN commission_type VARCHAR(50) NOT NULL DEFAULT 'PRODUCTION' AFTER user_role");
    }

    hasCheckedWorkflowColumns = true;
  }

  await seedDefaultOrderStatuses({ connection });
}

export function titleCaseWords(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

const defaultOrderStatuses = [
  { name: 'New', color: '#0EA5E9' },
  { name: 'Editing', color: '#10B981' },
  { name: 'Editing Done', color: '#8B5CF6' },
  { name: 'Editing Sent', color: '#06B6D4' },
  { name: 'Correction', color: '#F59E0B' },
  { name: 'Correction Done', color: '#84CC16' },
  { name: 'Address Received', color: '#2563EB' },
  { name: 'Order Confirmed', color: '#14B8A6' },
  { name: 'Billing Done', color: '#F97316' },
  { name: 'Save', color: '#A855F7' },
  { name: 'Save Done', color: '#6366F1' },
  { name: 'On Printing', color: '#EC4899' },
  { name: 'Printing Done', color: '#D946EF' },
  { name: 'Issued For Production', color: '#F43F5E' },
  { name: 'Collected By Night Branch', color: '#EAB308' },
  { name: 'Collected By Warehouse', color: '#22C55E' },
  { name: 'Collecting By Kb', color: '#0D9488' },
  { name: 'Production Ongoing', color: '#0891B2' },
  { name: 'Issued For Transport Lorry/Wheel', color: '#3B82F6' },
  { name: 'Order Processing', color: '#7C3AED' },
  { name: 'Order Reschedule 01', color: '#D97706' },
  { name: 'Order Reschedule 02', color: '#EA580C' },
  { name: 'Order Reschedule 03', color: '#DB2777' },
  { name: 'Complete', color: '#16A34A' },
  { name: 'Returned', color: '#DC2626' }
];

const fallbackStatusColors = [
  '#64748B',
  ...defaultOrderStatuses.map((status) => status.color)
];

export function isCompleteStatusName(statusName) {
  return ['complete', 'completed'].includes(String(statusName || '').trim().toLowerCase());
}

export function returnedCancelReason(statusName) {
  const normalized = String(statusName || '').trim().toLowerCase();
  if (['return', 'returned'].includes(normalized)) return 'Order returned';
  if (['cancel', 'cancelled', 'canceled'].includes(normalized)) return 'Order cancelled';
  return null;
}

export async function seedDefaultOrderStatuses({ connection = null } = {}) {
  for (const [index, status] of defaultOrderStatuses.entries()) {
    await run(
      connection,
      `INSERT INTO order_statuses (name, color, sort_order, is_final, is_active)
       SELECT ?, ?, ?, ?, TRUE
       WHERE NOT EXISTS (
         SELECT 1 FROM order_statuses existing_status WHERE LOWER(existing_status.name) = LOWER(?)
       )`,
      [status.name, status.color, index + 1, isCompleteStatusName(status.name) || ['returned'].includes(status.name.toLowerCase()), status.name]
    );

    await run(
      connection,
      `UPDATE order_statuses
       SET name = ?,
           color = ?,
           sort_order = ?,
           is_final = ?,
           is_active = TRUE
       WHERE LOWER(name) = LOWER(?)`,
      [status.name, status.color, index + 1, isCompleteStatusName(status.name) || status.name.toLowerCase() === 'returned', status.name]
    );
  }

  const rows = await run(
    connection,
    `SELECT id, name, color
     FROM order_statuses
     WHERE is_active = TRUE
     ORDER BY sort_order, id`
  );

  for (const [index, status] of rows.entries()) {
    const formattedName = titleCaseWords(status.name);
    const normalizedColor = String(status.color || '').trim().toLowerCase();
    const supportedColor = fallbackStatusColors.map((color) => color.toLowerCase()).includes(normalizedColor);
    const nextColor = supportedColor && normalizedColor !== 'slate'
      ? normalizedColor
      : fallbackStatusColors[index % fallbackStatusColors.length];

    if (formattedName !== status.name || nextColor !== normalizedColor) {
      await run(
        connection,
        'UPDATE order_statuses SET name = ?, color = ? WHERE id = ?',
        [formattedName, nextColor, status.id]
      );
    }
  }
}

export async function recordStatusChange({ orderId, fromStatusId, toStatusId, changedBy, note = null, connection = null }) {
  const runner = connection
    ? (sql, params) => connection.execute(sql, params)
    : (sql, params) => query(sql, params);

  await runner(
    `INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by, note)
     VALUES (?, ?, ?, ?, ?)`,
    [orderId, fromStatusId || null, toStatusId, changedBy, note]
  );
}

export async function applyOrderStatusWorkflow({ orderId, statusId, connection = null }) {
  await ensureStatusWorkflowSupport({ connection });
  const statusRows = await run(connection, 'SELECT name FROM order_statuses WHERE id = ?', [statusId]);
  const statusName = String(statusRows[0]?.name || '').trim().toLowerCase();

  const cancellationReason = returnedCancelReason(statusName);
  if (cancellationReason) {
    await cancelOrderCommissions({ orderId, reason: cancellationReason, connection });
    return `${cancellationReason}. Related commissions were removed.`;
  }

  return null;
}

function runnerFor(connection) {
  const runner = connection
    ? (sql, params) => connection.execute(sql, params)
    : (sql, params) => query(sql, params);
  return runner;
}

export async function cancelOrderCommissions({ orderId, reason = 'Order returned', connection = null }) {
  await ensureStatusWorkflowSupport({ connection });
  await run(
    connection,
    `UPDATE commissions
     SET is_payable = FALSE,
         commission_amount = 0,
         is_active = FALSE,
         cancelled_reason = ?,
         cancelled_at = NOW()
     WHERE order_id = ?`,
    [reason, orderId]
  );
}

export async function deductReturnedOrderCommissions({ orderId, connection = null }) {
  await ensureStatusWorkflowSupport({ connection });
  await run(
    connection,
    `UPDATE commissions
     SET commission_amount = GREATEST(commission_amount - 20, 0),
         cancelled_reason = 'Order returned - Rs. 20 deducted',
         cancelled_at = NOW()
     WHERE order_id = ?
       AND paid_at IS NULL
       AND cancelled_at IS NULL`,
    [orderId]
  );
}

export async function endActiveOrderCommissions({ orderId, commissionType = null, connection = null }) {
  const runner = runnerFor(connection);
  const typeClause = commissionType ? ' AND commission_type = ?' : '';
  const params = commissionType ? [orderId, commissionType] : [orderId];

  await runner(
    `UPDATE commissions
     SET is_active = FALSE, assignment_ended_at = NOW()
     WHERE order_id = ? AND is_active = TRUE${typeClause}`,
    params
  );
}

export async function createCommissionAssignment({
  orderId,
  employeeId,
  assignedBy,
  commissionAmount = 0,
  userRole = null,
  commissionType = 'PRODUCTION',
  connection = null
}) {
  if (!employeeId) return null;
  await ensureStatusWorkflowSupport({ connection });

  const runner = runnerFor(connection);

  await runner(
    `INSERT INTO commissions (order_id, employee_id, user_role, commission_type, assigned_by, commission_amount)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [orderId, employeeId, userRole, commissionType, assignedBy || null, commissionAmount || 0]
  );
  return null;
}

export async function updateCurrentCommission({
  orderId,
  employeeId,
  assignedBy,
  commissionAmount = 0,
  userRole = null,
  commissionType = 'PRODUCTION',
  connection = null
}) {
  if (!employeeId) return null;
  await ensureStatusWorkflowSupport({ connection });

  const runner = runnerFor(connection);
  const existing = await run(
    connection,
    `SELECT id
     FROM commissions
     WHERE order_id = ? AND employee_id = ? AND commission_type = ? AND is_active = TRUE
     ORDER BY assignment_started_at DESC, id DESC
     LIMIT 1`,
    [orderId, employeeId, commissionType]
  );

  if (existing.length) {
    await runner(
      `UPDATE commissions
       SET commission_amount = ?,
           user_role = COALESCE(?, user_role),
           assigned_by = COALESCE(?, assigned_by),
           is_payable = CASE WHEN cancelled_at IS NULL THEN is_payable ELSE FALSE END
       WHERE id = ?`,
      [commissionAmount || 0, userRole, assignedBy || null, existing[0].id]
    );
    return existing[0];
  }

  return createCommissionAssignment({ orderId, employeeId, assignedBy, commissionAmount, userRole, commissionType, connection });
}

export async function recordCommissionAssignment({
  orderId,
  employeeId,
  assignedBy,
  commissionAmount = 0,
  userRole = null,
  commissionType = 'PRODUCTION',
  connection = null
}) {
  if (!employeeId) return;

  await createCommissionAssignment({ orderId, employeeId, assignedBy, commissionAmount, userRole, commissionType, connection });
}

export async function recordOrderAssignment({
  orderId,
  oldEmployeeId = null,
  newEmployeeId,
  assignedBy,
  assignedByRole,
  commissionAmount = 0,
  reason = null,
  taskId = null,
  connection = null
}) {
  if (!newEmployeeId) return;

  const runner = connection
    ? (sql, params) => connection.execute(sql, params)
    : (sql, params) => query(sql, params);

  await runner(
    `UPDATE order_assignments
     SET is_current = FALSE, assignment_ended_at = NOW()
     WHERE order_id = ? AND task_id <=> ? AND is_current = TRUE`,
    [orderId, taskId]
  );

  await runner(
    `INSERT INTO order_assignments (
      order_id, task_id, assigned_to_employee_id, assigned_by_admin_id,
      assigned_by_role, commission_amount
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [orderId, taskId, newEmployeeId, assignedBy, assignedByRole, commissionAmount || 0]
  );

  await runner(
    `INSERT INTO assignment_history (
      order_id, task_id, old_employee_id, new_employee_id,
      changed_by_admin_id, changed_by_role, reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [orderId, taskId, oldEmployeeId || null, newEmployeeId, assignedBy, assignedByRole, reason]
  );
}

export async function markOrderCommissionsPayable({ orderId, connection = null }) {
  await ensureStatusWorkflowSupport({ connection });
  const runner = runnerFor(connection);

  await runner('UPDATE commissions SET is_payable = TRUE WHERE order_id = ? AND cancelled_at IS NULL', [orderId]);
}

export async function upsertCompletionCommission({
  orderId,
  employeeId,
  assignedBy,
  commissionAmount = 0,
  userRole = null,
  commissionType = 'PRODUCTION',
  connection = null
}) {
  if (!employeeId) return null;
  await ensureStatusWorkflowSupport({ connection });

  const existing = await run(
    connection,
    `SELECT id
     FROM commissions
     WHERE order_id = ? AND employee_id = ? AND commission_type = ? AND cancelled_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    [orderId, employeeId, commissionType]
  );

  if (existing.length) {
    await run(
      connection,
      `UPDATE commissions
       SET commission_amount = ?,
           user_role = COALESCE(?, user_role),
           assigned_by = COALESCE(?, assigned_by),
           is_active = TRUE,
           is_payable = TRUE
       WHERE id = ?`,
      [commissionAmount || 0, userRole, assignedBy || null, existing[0].id]
    );
    return existing[0];
  }

  await run(
    connection,
    `INSERT INTO commissions (
       order_id, employee_id, user_role, commission_type, assigned_by,
       commission_amount, is_active, is_payable, assignment_started_at
     )
     VALUES (?, ?, ?, ?, ?, ?, TRUE, TRUE, NOW())`,
    [orderId, employeeId, userRole, commissionType, assignedBy || null, commissionAmount || 0]
  );
  return null;
}
