import { query } from '../config/db.js';

let hasCheckedAttendanceTable = false;

export async function ensureAttendanceTable() {
  if (hasCheckedAttendanceTable) return;

  await query(
    `CREATE TABLE IF NOT EXISTS attendance_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      attendance_date DATE NOT NULL,
      login_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      logout_time TIMESTAMP NULL,
      logout_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
      INDEX idx_attendance_employee_date (employee_id, attendance_date),
      INDEX idx_attendance_date (attendance_date)
    )`
  );

  hasCheckedAttendanceTable = true;
}

export function shouldTrackAttendance(role) {
  return ['CO_ADMIN', 'PRODUCTION_EMPLOYEE'].includes(String(role || '').toUpperCase());
}

export async function recordLoginAttendance(user) {
  if (!shouldTrackAttendance(user.role)) return null;
  await ensureAttendanceTable();

  const existing = await query(
    `SELECT id
     FROM attendance_logs
     WHERE employee_id = :employeeId
       AND attendance_date = CURDATE()
     ORDER BY login_time ASC
     LIMIT 1`,
    { employeeId: user.id }
  );

  if (existing.length) {
    return { id: existing[0].id, created: false };
  }

  const result = await query(
    `INSERT INTO attendance_logs (employee_id, attendance_date, login_time, logout_status)
     VALUES (:employeeId, CURDATE(), NOW(), 'PENDING')`,
    { employeeId: user.id }
  );

  return { id: result.insertId, created: true };
}

export async function recordLogoutAttendance(employeeId) {
  await ensureAttendanceTable();
  await query(
    `UPDATE attendance_logs
     SET logout_time = NOW(), logout_status = 'LOGGED_OUT'
     WHERE employee_id = :employeeId
       AND attendance_date = CURDATE()
     ORDER BY login_time ASC
     LIMIT 1`,
    { employeeId }
  );
}
