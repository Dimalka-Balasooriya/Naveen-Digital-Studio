import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const sslEnabled = String(process.env.DB_SSL || '').toLowerCase() === 'true';

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 3),
  queueLimit: 0,
  namedPlaceholders: true,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  ssl: sslEnabled ? { rejectUnauthorized: false } : undefined
});

export async function query(sql, params = {}) {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    console.error(`[db] Query failed: ${error.code || error.message}`);
    throw error;
  }
}
