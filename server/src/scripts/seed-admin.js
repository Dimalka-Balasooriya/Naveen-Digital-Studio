import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { query, pool } from '../config/db.js';

dotenv.config();

const email = process.env.SEED_ADMIN_EMAIL || 'admin@naveendigitalstudio.com';
const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
const name = process.env.SEED_ADMIN_NAME || 'Naveen Owner';

const roleRows = await query("SELECT id FROM roles WHERE name = 'OWNER' LIMIT 1");
if (!roleRows.length) {
  throw new Error("OWNER role is missing. Insert roles before running seed:admin.");
}

const passwordHash = await bcrypt.hash(password, 10);
const existing = await query('SELECT id FROM employees WHERE email = :email', { email });

if (existing.length) {
  await query(
    `UPDATE employees
     SET name = :name, role_id = :roleId, password_hash = :passwordHash, is_active = TRUE
     WHERE email = :email`,
    { name, roleId: roleRows[0].id, passwordHash, email }
  );
  console.log(`Owner admin updated: ${email}`);
} else {
  await query(
    `INSERT INTO employees (role_id, name, email, password_hash, is_active)
     VALUES (:roleId, :name, :email, :passwordHash, TRUE)`,
    { roleId: roleRows[0].id, name, email, passwordHash }
  );
  console.log(`Owner admin created: ${email}`);
}

await pool.end();
