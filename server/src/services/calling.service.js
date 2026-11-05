import { createHash } from 'node:crypto';
import { z } from 'zod';

export const CALLING_STATUSES = ['Not Called', 'No Answer', 'Call Back', 'Confirmed', 'Wrong Number', 'Completed', 'Correction (Call Agent)'];
export const ELIGIBLE_STATUSES = ['Editing Send', 'Correction Send'];
export const callingUpdateSchema = z.object({
  status: z.enum(CALLING_STATUSES), notes: z.string().trim().max(2000).default(''),
  expected_version: z.number().int().nonnegative(), request_id: z.string().uuid()
}).strict();
export const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  production_status: z.enum(ELIGIBLE_STATUSES).optional(),
  calling_status: z.enum(CALLING_STATUSES).optional(),
  search: z.string().trim().max(120).default('')
});
export function callingError(message, status) { return Object.assign(new Error(message), { status }); }
export function callingPriority(status) { return status === 'Not Called' ? 0 : status === 'Call Back' ? 1 : status === 'No Answer' ? 2 : 3; }
export const eligibleWhere = `BINARY s.name IN (${ELIGIBLE_STATUSES.map((status) => `'${status}'`).join(',')})
  AND COALESCE(o.is_deleted, FALSE)=FALSE AND o.deleted_at IS NULL
  AND COALESCE(o.archived_from_active_list, FALSE)=FALSE`;
export function queueQuery(input) {
  const { page, limit, production_status, calling_status, search } = listSchema.parse(input);
  const filters = [eligibleWhere], params = [];
  if (production_status) { filters.push('BINARY s.name = ?'); params.push(production_status); }
  if (calling_status) { filters.push("COALESCE(cs.calling_status, 'Not Called') = ?"); params.push(calling_status); }
  if (search) {
    // Literal substring search: %, _ and quotes are data, never SQL/wildcards.
    filters.push(`(LOCATE(LOWER(?), LOWER(o.order_number)) > 0
      OR LOCATE(?, CAST(o.id AS CHAR)) > 0
      OR LOCATE(LOWER(?), LOWER(c.name)) > 0)`);
    params.push(search, search, search);
  }
  const from = `FROM orders o JOIN customers c ON c.id=o.customer_id
    JOIN order_statuses s ON s.id=o.status_id
    LEFT JOIN order_calling_state cs ON cs.order_id=o.id WHERE ${filters.join(' AND ')}`;
  return { page, limit, params, countSql: `SELECT COUNT(*) AS total ${from}`,
    sql: `SELECT o.id, o.order_number, c.name AS customer_name, c.phone AS customer_phone,
      o.recipient_contact_number, s.name AS production_status,
      COALESCE(cs.calling_status, 'Not Called') AS calling_status, COALESCE(cs.version, 0) AS calling_version,
      COALESCE((SELECT MAX(h.changed_at) FROM order_status_history h
        WHERE h.order_id=o.id AND h.to_status_id=o.status_id
          AND (h.from_status_id IS NULL OR h.from_status_id <> h.to_status_id)), o.created_at) AS eligible_since
      ${from}
      ORDER BY CASE COALESCE(cs.calling_status, 'Not Called')
        WHEN 'Not Called' THEN 0 WHEN 'Call Back' THEN 1 WHEN 'No Answer' THEN 2 ELSE 3 END,
        eligible_since ASC, o.id ASC LIMIT ${limit} OFFSET ${(page - 1) * limit}` };
}

export async function updateCalling(connection, { orderId, agentId, body }) {
  const input = callingUpdateSchema.parse(body);
  const hash = createHash('sha256').update(JSON.stringify([input.status, input.notes, input.expected_version])).digest('hex');
  await connection.beginTransaction();
  try {
    // Lock the order, also serializing against existing order/status transactions.
    const [orders] = await connection.execute(`SELECT o.id, s.name AS production_status, o.is_deleted,
      o.deleted_at, o.archived_from_active_list FROM orders o JOIN order_statuses s ON s.id=o.status_id
      WHERE o.id=? FOR UPDATE`, [orderId]);
    if (!orders.length) throw callingError('Order not found.', 404);
    const order = orders[0];
    if (!ELIGIBLE_STATUSES.includes(order.production_status) || order.is_deleted || order.deleted_at || order.archived_from_active_list) {
      throw callingError('This order is no longer eligible for calling. Refresh the queue.', 409);
    }
    const [requests] = await connection.execute('SELECT * FROM order_calling_requests WHERE request_id=?', [input.request_id]);
    const [states] = await connection.execute('SELECT calling_status, version FROM order_calling_state WHERE order_id=? FOR UPDATE', [orderId]);
    const state = states[0] || { calling_status: 'Not Called', version: 0 };
    if (requests.length) {
      const saved = requests[0];
      if (Number(saved.order_id) !== Number(orderId) || Number(saved.agent_id) !== Number(agentId) || saved.payload_hash !== hash) {
        throw callingError('Request ID was already used for a different update.', 409);
      }
      await connection.commit();
      return { calling_status: state.calling_status, calling_version: Number(state.version), replayed: true };
    }
    if (Number(state.version) !== input.expected_version) throw callingError('Another agent updated this order. Refresh before saving again.', 409);
    await connection.execute('INSERT INTO order_calling_requests (request_id, order_id, agent_id, payload_hash) VALUES (?, ?, ?, ?)',
      [input.request_id, orderId, agentId, hash]);
    const changed = state.calling_status !== input.status;
    if (changed) {
      await connection.execute(`INSERT INTO order_calling_state (order_id, calling_status, version) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE calling_status=VALUES(calling_status), version=VALUES(version)`, [orderId, input.status, Number(state.version) + 1]);
      await connection.execute(`INSERT INTO order_calling_history
        (order_id, previous_status, new_status, agent_id, request_id, notes) VALUES (?, ?, ?, ?, ?, ?)`,
      [orderId, state.calling_status, input.status, agentId, input.request_id, input.notes || null]);
    }
    await connection.commit();
    return { calling_status: changed ? input.status : state.calling_status,
      calling_version: Number(state.version) + (changed ? 1 : 0), changed };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') throw callingError('Request ID already exists. Refresh and retry.', 409);
    throw error;
  }
}
