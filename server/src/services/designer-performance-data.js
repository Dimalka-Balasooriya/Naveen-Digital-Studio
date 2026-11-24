import { pool } from '../config/db.js';
import { calculatePerformance, reportRange } from './designer-performance.js';

export async function loadDesignerPerformance(input) {
  const range = reportRange(input);
  const connection = await pool.getConnection();
  try {
    // One consistent read, no workflow initializers, DDL, backfills or production writes.
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const [designers] = await connection.query(`SELECT e.id,e.name,e.is_active FROM employees e
      JOIN roles r ON r.id=e.role_id WHERE UPPER(r.name) IN ('DESIGN_TEAM','DESIGN') ORDER BY e.name,e.id`);
    const [orders] = await connection.execute(`SELECT o.id,o.order_number,o.assigned_employee_id,
      UNIX_TIMESTAMP(o.created_at)*1000 AS created, UNIX_TIMESTAMP(o.deleted_at)*1000 AS deleted,
      o.is_deleted,o.archived_from_active_list AS archived,s.name AS status
      FROM orders o JOIN order_statuses s ON s.id=o.status_id WHERE o.created_at < FROM_UNIXTIME(?) LIMIT 10001`, [range.until/1000]);
    const [assignments] = await connection.execute(`SELECT a.id,a.order_id,a.task_id,a.assigned_to_employee_id AS designer_id,
      UNIX_TIMESTAMP(a.assignment_started_at)*1000 AS start, UNIX_TIMESTAMP(a.assignment_ended_at)*1000 AS end
      FROM order_assignments a JOIN orders o ON o.id=a.order_id WHERE o.created_at < FROM_UNIXTIME(?) LIMIT 200001`, [range.until/1000]);
    // Include subsequent transitions to detect missing end-of-day history; never use current status for a past day.
    const [history] = await connection.execute(`SELECT h.id,h.order_id,h.changed_by AS actor_id,
      UNIX_TIMESTAMP(h.changed_at)*1000 AS time,f.name AS \`from\`,t.name AS \`to\`
      FROM order_status_history h JOIN orders o ON o.id=h.order_id
      LEFT JOIN order_statuses f ON f.id=h.from_status_id JOIN order_statuses t ON t.id=h.to_status_id
      WHERE o.created_at < FROM_UNIXTIME(?) LIMIT 200001`, [range.until/1000]);
    if (orders.length > 10000 || assignments.length > 200000 || history.length > 200000) {
      throw Object.assign(new Error('Report exceeds the interactive history limit. No partial totals were returned; an offline reporting job is required for this dataset.'), {status:422});
    }
    await connection.commit();
    for (const row of orders) for (const key of ['created','deleted']) if (row[key] != null) row[key] = Number(row[key]);
    for (const row of assignments) for (const key of ['start','end']) if (row[key] != null) row[key] = Number(row[key]);
    for (const row of history) row.time = Number(row.time);
    return calculatePerformance({designers,orders,assignments,history},range);
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
