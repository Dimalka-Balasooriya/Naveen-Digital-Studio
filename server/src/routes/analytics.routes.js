import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const [counts, recentOrders, weeklyTrend, leaderboard, completionTrend, commissionTotals, fastReminders] = await Promise.all([
      query(
        `SELECT
          SUM(CASE WHEN DATE(o.created_at) = CURDATE() THEN o.order_quantity ELSE 0 END) AS daily_order_quantity,
          SUM(CASE WHEN YEARWEEK(o.created_at, 1) = YEARWEEK(CURDATE(), 1) THEN o.order_quantity ELSE 0 END) AS weekly_order_quantity,
          SUM(CASE WHEN YEAR(o.created_at) = YEAR(CURDATE()) AND MONTH(o.created_at) = MONTH(CURDATE()) THEN o.order_quantity ELSE 0 END) AS monthly_order_quantity,
          SUM(CASE WHEN s.name = 'Completed' THEN o.order_quantity ELSE 0 END) AS completed_quantity,
          SUM(CASE WHEN s.name NOT IN ('Completed', 'Returned') THEN o.order_quantity ELSE 0 END) AS pending_quantity,
          SUM(CASE WHEN s.name = 'Returned' THEN o.order_quantity ELSE 0 END) AS returned_quantity,
          SUM(o.is_fast = TRUE) AS fast_orders_count
        FROM orders o
        JOIN order_statuses s ON s.id = o.status_id`
      ),
      query(
        `SELECT o.id, o.order_number, o.order_quantity, c.name AS customer_name, p.name AS product_name,
          s.name AS status_name, s.color AS status_color, o.is_fast, o.needed_date
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         JOIN products p ON p.id = o.product_id
         JOIN order_statuses s ON s.id = o.status_id
         ORDER BY o.created_at DESC
         LIMIT 8`
      ),
      query(
        `SELECT DATE(created_at) AS date, SUM(order_quantity) AS count
         FROM orders
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
         GROUP BY DATE(created_at)
         ORDER BY date`
      ),
      query(
        `SELECT e.id, e.name,
          SUM(CASE WHEN s.name = 'Completed' THEN o.order_quantity ELSE 0 END) AS completed_orders,
          ROUND(AVG(CASE WHEN s.name = 'Completed' THEN TIMESTAMPDIFF(HOUR, o.created_at, o.updated_at) END), 2) AS avg_completion_hours,
          COALESCE(SUM(c.commission_amount), 0) AS commission_total
         FROM employees e
         JOIN roles r ON r.id = e.role_id
         LEFT JOIN orders o ON o.assigned_employee_id = e.id
         LEFT JOIN order_statuses s ON s.id = o.status_id
         LEFT JOIN commissions c ON c.employee_id = e.id
         WHERE r.name = 'production'
         GROUP BY e.id
         ORDER BY completed_orders DESC, avg_completion_hours ASC`
      ),
      query(
        `SELECT DATE(o.updated_at) AS date, SUM(o.order_quantity) AS count
         FROM orders o
         JOIN order_statuses s ON s.id = o.status_id
         WHERE s.name = 'Completed' AND o.updated_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         GROUP BY DATE(o.updated_at)
         ORDER BY date`
      ),
      query(
        `SELECT e.name, COALESCE(SUM(c.commission_amount), 0) AS total
         FROM employees e
         JOIN roles r ON r.id = e.role_id
         LEFT JOIN commissions c ON c.employee_id = e.id
         WHERE r.name = 'production'
         GROUP BY e.id
         ORDER BY total DESC`
      ),
      query(
        `SELECT o.id, o.order_number, o.order_quantity, c.name AS customer_name, e.name AS employee_name, o.needed_date
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN employees e ON e.id = o.assigned_employee_id
         JOIN order_statuses s ON s.id = o.status_id
         WHERE o.is_fast = TRUE AND s.name NOT IN ('Completed', 'Returned')
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
