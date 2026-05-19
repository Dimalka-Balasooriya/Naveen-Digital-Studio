import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { signToken } from '../utils/tokens.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

router.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const rows = await query(
      `SELECT e.id, e.name, e.email, e.phone, e.password_hash, e.is_active, r.name AS role
       FROM employees e
       JOIN roles r ON r.id = e.role_id
       WHERE e.email = :email`,
      { email: body.email }
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isValid = await bcrypt.compare(body.password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = signToken(user);
    delete user.password_hash;
    res.json({ token, user });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

export default router;
