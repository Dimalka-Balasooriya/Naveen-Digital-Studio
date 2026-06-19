import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { signToken } from '../utils/tokens.js';
import { recordLoginAttendance, recordLogoutAttendance } from '../utils/attendance.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

router.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    console.log(`[auth] Login attempt for ${body.email}`);
    const rows = await query(
      `SELECT e.id, e.name, e.email, e.phone, e.password_hash, e.is_active, r.name AS role
       FROM employees e
       JOIN roles r ON r.id = e.role_id
       WHERE e.email = :email`,
      { email: body.email }
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      console.warn(`[auth] Login failed for ${body.email}: ${!user ? 'employee not found' : 'employee inactive'}`);
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isValid = await bcrypt.compare(body.password, user.password_hash);
    if (!isValid) {
      console.warn(`[auth] Login failed for ${body.email}: password mismatch`);
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('[auth] Login failed: JWT_SECRET is missing');
      return res.status(500).json({ message: 'Server authentication is not configured.' });
    }

    const token = signToken(user);
    const attendance = await recordLoginAttendance(user);
    delete user.password_hash;
    console.log(`[auth] Login success for ${body.email} with role ${user.role}`);
    res.json({
      token,
      user,
      attendanceLogId: attendance?.id || null,
      attendanceStatus: attendance?.created ? 'created' : attendance ? 'existing' : 'not_tracked'
    });
  } catch (error) {
    console.error(`[auth] Login error: ${error.code || error.message}`);
    if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error?.code)) {
      return res.status(503).json({ message: 'Database connection failed. Check hosting database environment variables.' });
    }
    next(error);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await recordLogoutAttendance(req.user.id);
    res.json({ message: 'Logout recorded.' });
  } catch (error) {
    next(error);
  }
});

export default router;
