import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/search', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const search = `%${req.query.q || ''}%`;
    const customers = await query(
      `SELECT id, name, phone, address, notes
       FROM customers
       WHERE name LIKE :search OR phone LIKE :search
       ORDER BY name
       LIMIT 10`,
      { search }
    );

    const results = await Promise.all(customers.map(async (customer) => {
      const orders = await query(
        `SELECT o.id, o.order_number, o.order_quantity, o.needed_date, o.is_fast,
          p.name AS product_name, fp.name AS facebook_page_name, s.name AS status_name, s.color AS status_color
         FROM orders o
         JOIN products p ON p.id = o.product_id
         LEFT JOIN facebook_pages fp ON fp.id = o.facebook_page_id
         JOIN order_statuses s ON s.id = o.status_id
         WHERE o.customer_id = :customerId
         ORDER BY o.created_at DESC`,
        { customerId: customer.id }
      );
      return { ...customer, orders };
    }));

    res.json(results);
  } catch (error) {
    next(error);
  }
});

export default router;
