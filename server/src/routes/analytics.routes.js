import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

let hasCheckedOrderArchiveColumns = false;
async function ensureOrderArchiveSupport() {
  if (hasCheckedOrderArchiveColumns) return;
  const columns = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'orders'
       AND COLUMN_NAME IN ('deleted_at', 'deleted_by', 'is_deleted', 'archived_from_active_list')`
  );
  const existing = new Set(columns.map((column) => column.COLUMN_NAME));
  if (!existing.has('deleted_at')) await query('ALTER TABLE orders ADD COLUMN deleted_at TIMESTAMP NULL AFTER updated_at');
  if (!existing.has('deleted_by')) await query('ALTER TABLE orders ADD COLUMN deleted_by INT NULL AFTER deleted_at');
  if (!existing.has('is_deleted')) await query('ALTER TABLE orders ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE AFTER deleted_by');
  if (!existing.has('archived_from_active_list')) await query('ALTER TABLE orders ADD COLUMN archived_from_active_list BOOLEAN NOT NULL DEFAULT FALSE AFTER is_deleted');
  hasCheckedOrderArchiveColumns = true;
}

router.get('/', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    await ensureOrderArchiveSupport();
    const [counts, recentOrders, weeklyTrend, leaderboard, completionTrend, commissionTotals, fastReminders] = await Promise.all([
      query(
        `SELECT
          COUNT(DISTINCT CASE WHEN DATE(o.created_at) = CURDATE() THEN o.id END) AS daily_order_quantity,
          COUNT(DISTINCT CASE WHEN YEARWEEK(o.created_at, 1) = YEARWEEK(CURDATE(), 1) THEN o.id END) AS weekly_order_quantity,
          COUNT(DISTINCT CASE WHEN YEAR(o.created_at) = YEAR(CURDATE()) AND MONTH(o.created_at) = MONTH(CURDATE()) THEN o.id END) AS monthly_order_quantity,
          COUNT(DISTINCT CASE WHEN LOWER(s.name) = 'completed' THEN o.id END) AS completed_quantity,
          COUNT(DISTINCT CASE WHEN LOWER(s.name) = 'pending' THEN o.id END) AS pending_quantity,
          COUNT(DISTINCT CASE WHEN LOWER(s.name) IN ('returned', 'return') THEN o.id END) AS returned_quantity,
          COUNT(DISTINCT CASE WHEN o.is_fast = TRUE THEN o.id END) AS fast_orders_count
        FROM orders o
        JOIN order_statuses s ON s.id = o.status_id
        WHERE COALESCE(o.archived_from_active_list, FALSE) = FALSE`
      ),
      query(
        `SELECT o.id, o.order_number, o.order_quantity, c.name AS customer_name, p.name AS product_name,
          s.name AS status_name, s.color AS status_color, o.is_fast, o.needed_date
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         JOIN products p ON p.id = o.product_id
         JOIN order_statuses s ON s.id = o.status_id
         WHERE COALESCE(o.archived_from_active_list, FALSE) = FALSE
         ORDER BY o.created_at DESC
         LIMIT 8`
      ),
      query(
        `SELECT DATE(created_at) AS date, COUNT(*) AS count
         FROM orders
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
           AND COALESCE(archived_from_active_list, FALSE) = FALSE
         GROUP BY DATE(created_at)
         ORDER BY date`
      ),
      query(
        `SELECT e.id, e.name,
          COUNT(DISTINCT o.id) AS assigned_orders,
          COUNT(DISTINCT CASE WHEN LOWER(s.name) = 'completed' THEN o.id END) AS completed_orders,
          COUNT(DISTINCT CASE WHEN LOWER(s.name) = 'pending' THEN o.id END) AS pending_orders,
          ROUND(AVG(CASE WHEN LOWER(s.name) = 'completed' THEN TIMESTAMPDIFF(HOUR, o.created_at, o.updated_at) END), 2) AS avg_completion_hours,
          COALESCE(MAX(cs.commission_total), 0) AS commission_total
         FROM employees e
         JOIN roles r ON r.id = e.role_id
         LEFT JOIN orders o ON o.assigned_employee_id = e.id AND COALESCE(o.archived_from_active_list, FALSE) = FALSE
         LEFT JOIN order_statuses s ON s.id = o.status_id
         LEFT JOIN (
           SELECT latest.employee_id, SUM(latest.commission_amount) AS commission_total
           FROM commissions latest
           JOIN (
             SELECT employee_id, order_id, commission_type, MAX(id) AS latest_id
             FROM commissions
             GROUP BY employee_id, order_id, commission_type
           ) picked ON picked.latest_id = latest.id
           GROUP BY latest.employee_id
         ) cs ON cs.employee_id = e.id
         WHERE r.name IN ('CO_ADMIN', 'PRODUCTION_EMPLOYEE', 'production')
           AND e.deleted_at IS NULL
         GROUP BY e.id
         ORDER BY completed_orders DESC, avg_completion_hours ASC`
      ),
      query(
        `SELECT DATE(o.updated_at) AS date, COUNT(*) AS count
         FROM orders o
         JOIN order_statuses s ON s.id = o.status_id
         WHERE s.name = 'Completed'
           AND o.updated_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
           AND COALESCE(o.archived_from_active_list, FALSE) = FALSE
         GROUP BY DATE(o.updated_at)
         ORDER BY date`
      ),
      query(
        `SELECT e.name, COALESCE(MAX(cs.total), 0) AS total
         FROM employees e
         JOIN roles r ON r.id = e.role_id
         LEFT JOIN (
           SELECT latest.employee_id, SUM(latest.commission_amount) AS total
           FROM commissions latest
           JOIN (
             SELECT employee_id, order_id, commission_type, MAX(id) AS latest_id
             FROM commissions
             GROUP BY employee_id, order_id, commission_type
           ) picked ON picked.latest_id = latest.id
           GROUP BY latest.employee_id
         ) cs ON cs.employee_id = e.id
         WHERE r.name IN ('CO_ADMIN', 'PRODUCTION_EMPLOYEE', 'production')
           AND e.deleted_at IS NULL
         GROUP BY e.id
         ORDER BY total DESC`
      ),
      query(
        `SELECT o.id, o.order_number, o.order_quantity, c.name AS customer_name, e.name AS employee_name, o.needed_date
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN employees e ON e.id = o.assigned_employee_id
         JOIN order_statuses s ON s.id = o.status_id
         WHERE o.is_fast = TRUE
           AND s.name NOT IN ('Completed', 'Returned')
           AND COALESCE(o.archived_from_active_list, FALSE) = FALSE
         ORDER BY o.needed_date ASC
         LIMIT 6`
      )
    ]);

    const completed = leaderboard.filter((item) => Number(item.completed_orders) > 0);
    const fastest = completed
      .filter((item) => item.avg_completion_hours !== null)
      .sort((a, b) => Number(a.avg_completion_hours) - Number(b.avg_completion_hours))[0] || null;

    res.json({
      summary: counts[0],
      recentOrders,
      weeklyTrend,
      leaderboard,
      completionTrend,
      commissionTotals,
      fastReminders,
      highlights: {
        mostCompleted: leaderboard[0] || null,
        leastCompleted: leaderboard[leaderboard.length - 1] || null,
        fastest
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
