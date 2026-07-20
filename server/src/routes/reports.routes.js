import { Router } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { query } from '../config/db.js';
import { authenticate, requireAdminOrCoAdmin } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

function monthRange(month) {
  const value = month || new Date().toISOString().slice(0, 7);
  return { month: value, start: `${value}-01` };
}

function money(value) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

function fmtDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' });
}

function buildFilters(queryParams, aliases = {}) {
  const clauses = [];
  const params = {};
  if (queryParams.employee_id) {
    clauses.push(`${aliases.employee || 'e'}.id = :employeeId`);
    params.employeeId = queryParams.employee_id;
  }
  if (queryParams.role) {
    clauses.push(`${aliases.role || 'r'}.name = :role`);
    params.role = queryParams.role;
  }
  if (queryParams.status) {
    clauses.push(`${aliases.status || 's'}.name = :status`);
    params.status = queryParams.status;
  }
  return { clauses, params };
}

async function commissionRows(queryParams = {}, currentUser = null) {
  const range = monthRange(queryParams.month);
  const filters = buildFilters(queryParams);
  if (currentUser?.role === 'CO_ADMIN') {
    filters.clauses.push('e.id = :currentEmployeeId');
    filters.params.currentEmployeeId = currentUser.id;
  }
  const where = filters.clauses.length ? `AND ${filters.clauses.join(' AND ')}` : '';
  return query(
    `SELECT e.name AS employee_name, e.email, r.name AS employee_role, o.order_number,
      o.order_quantity, c.user_role, c.commission_type, c.commission_amount, c.is_payable, c.paid_at,
      c.assignment_started_at, c.assignment_ended_at, admin.name AS assigned_by_name,
      COALESCE(oa.assigned_by_role, 'OWNER') AS assigned_by_role,
      COALESCE(summary.monthly_commission_total, 0) AS total_monthly_commission,
      COALESCE(summary.orders_count, 0) AS orders_count,
      summary.latest_order_status
     FROM commissions c
     JOIN employees e ON e.id = c.employee_id
     JOIN roles r ON r.id = e.role_id
     JOIN orders o ON o.id = c.order_id
     JOIN order_statuses s ON s.id = o.status_id
     LEFT JOIN order_assignments oa ON oa.order_id = o.id AND oa.assigned_to_employee_id = e.id
     LEFT JOIN employees admin ON admin.id = COALESCE(oa.assigned_by_admin_id, c.assigned_by)
     LEFT JOIN (
       SELECT monthly.employee_id,
         SUM(monthly.commission_amount) AS monthly_commission_total,
         COUNT(DISTINCT monthly.order_id) AS orders_count,
         (
           SELECT latest_status.name
           FROM commissions latest_commission
           JOIN orders latest_order ON latest_order.id = latest_commission.order_id
           JOIN order_statuses latest_status ON latest_status.id = latest_order.status_id
           WHERE latest_commission.employee_id = monthly.employee_id
             AND DATE(latest_commission.assignment_started_at) BETWEEN :start AND LAST_DAY(:start)
           ORDER BY latest_commission.assignment_started_at DESC, latest_commission.id DESC
           LIMIT 1
         ) AS latest_order_status
       FROM commissions monthly
       WHERE DATE(monthly.assignment_started_at) BETWEEN :start AND LAST_DAY(:start)
       GROUP BY monthly.employee_id
     ) summary ON summary.employee_id = e.id
     WHERE DATE(c.assignment_started_at) BETWEEN :start AND LAST_DAY(:start)
       AND r.name <> 'OWNER'
       AND e.deleted_at IS NULL
     ${where}
     ORDER BY e.name, c.assignment_started_at`,
    { start: range.start, ...filters.params }
  );
}

async function performanceRows(queryParams = {}, currentUser = null) {
  const range = monthRange(queryParams.month);
  const filters = buildFilters(queryParams);
  const where = filters.clauses.length ? `AND ${filters.clauses.join(' AND ')}` : '';
  const rows = await query(
    `SELECT e.id, e.name AS employee_name, e.email, r.name AS employee_role,
      COUNT(DISTINCT CASE WHEN LOWER(s.name) = 'completed' THEN o.id END) AS completed_orders,
      COUNT(DISTINCT CASE WHEN LOWER(s.name) = 'completed' AND o.is_fast = TRUE THEN o.id END) AS fast_orders_completed,
      ROUND(AVG(CASE WHEN LOWER(s.name) = 'completed' THEN TIMESTAMPDIFF(HOUR, o.created_at, o.updated_at) END), 2) AS average_completion_hours,
      COALESCE(MAX(cs.commission_total), 0) AS commission_total,
      MAX(admin.name) AS assigned_by_name,
      MAX(oa.assigned_by_role) AS assigned_by_role
     FROM employees e
     JOIN roles r ON r.id = e.role_id
     LEFT JOIN orders o ON o.assigned_employee_id = e.id AND DATE(o.updated_at) BETWEEN :start AND LAST_DAY(:start)
     LEFT JOIN order_statuses s ON s.id = o.status_id
     LEFT JOIN (
       SELECT latest.employee_id, SUM(latest.commission_amount) AS commission_total
       FROM commissions latest
       JOIN (
         SELECT employee_id, order_id, commission_type, MAX(id) AS latest_id
         FROM commissions
         WHERE DATE(assignment_started_at) BETWEEN :start AND LAST_DAY(:start)
         GROUP BY employee_id, order_id, commission_type
       ) picked ON picked.latest_id = latest.id
       GROUP BY latest.employee_id
     ) cs ON cs.employee_id = e.id
     LEFT JOIN order_assignments oa ON oa.assigned_to_employee_id = e.id
     LEFT JOIN employees admin ON admin.id = oa.assigned_by_admin_id
     WHERE r.name IN ('CO_ADMIN', 'PRODUCTION_EMPLOYEE', 'DESIGN_TEAM', 'production')
       AND e.deleted_at IS NULL
     ${where}
     GROUP BY e.id, r.name
     ORDER BY completed_orders DESC, commission_total DESC`,
    { start: range.start, ...filters.params }
  );
  return rows.map((row, index) => ({ ...row, performance_rank: index + 1 }));
}

function addHeader(doc, title, range) {
  doc.rect(36, 32, 523, 76).fill('#172033');
  doc.fillColor('#5eead4').fontSize(10).text('NAVEEN DIGITAL STUDIO', 56, 48, { characterSpacing: 2 });
  doc.fillColor('#ffffff').fontSize(20).text(title, 56, 66);
  doc.fontSize(9).fillColor('#dbeafe').text(`Generated: ${fmtDate(new Date())}`, 390, 48, { width: 150, align: 'right' });
  doc.text(`Month: ${range.month}`, 390, 66, { width: 150, align: 'right' });
  doc.fillColor('#111827');
  doc.y = 128;
}

function addSummaryCards(doc, cards) {
  const startY = doc.y;
  const gap = 10;
  const cardWidth = (523 - gap * 3) / 4;
  const cardHeight = 58;
  cards.forEach((card, index) => {
    const x = 36 + index * (cardWidth + gap);
    doc.roundedRect(x, startY, cardWidth, cardHeight, 6).fillAndStroke('#f8fafc', '#dbe3ef');
    doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold')
      .text(card.label, x + 10, startY + 10, { width: cardWidth - 20, height: 12, ellipsis: true });
    doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold')
      .text(String(card.value), x + 10, startY + 29, { width: cardWidth - 20, height: 22, ellipsis: true });
  });
  doc.y = startY + cardHeight + 26;
}

function addFooter(doc) {
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor('#64748b')
      .text('Naveen Digital Studio', 36, 810)
      .text(`Page ${i + 1} of ${pages.count}`, 470, 810, { width: 90, align: 'right' });
  }
}

function addTable(doc, columns, rows) {
  const startX = 36;
  const tableWidth = 523;
  const headerHeight = 24;
  const minRowHeight = 30;
  const maxRowHeight = 62;
  let y = doc.y;
  const drawHeader = () => {
    doc.rect(startX, y, tableWidth, headerHeight).fill('#dbe5f1');
    let x = startX;
    columns.forEach((column) => {
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5)
        .text(column.label, x + 5, y + 8, { width: column.width - 10, height: headerHeight - 10, ellipsis: true });
      x += column.width;
    });
    y += headerHeight;
  };

  drawHeader();
  rows.forEach((row, index) => {
    doc.font('Helvetica').fontSize(7.5);
    const values = columns.map((column) => String(column.value(row) ?? '-'));
    const rowHeight = Math.min(
      maxRowHeight,
      Math.max(
        minRowHeight,
        ...columns.map((column, columnIndex) => doc.heightOfString(values[columnIndex], { width: column.width - 10 }) + 14)
      )
    );

    if (y + rowHeight > 780) {
      doc.addPage();
      y = 44;
      drawHeader();
    }
    doc.rect(startX, y, tableWidth, rowHeight).fill(index % 2 ? '#ffffff' : '#f8fafc').stroke('#e5e7eb');
    let x = startX;
    columns.forEach((column, columnIndex) => {
      doc.fillColor('#111827').font('Helvetica').fontSize(7.5).text(values[columnIndex], x + 5, y + 7, {
        width: column.width - 10,
        height: rowHeight - 11,
        ellipsis: true
      });
      x += column.width;
    });
    y += rowHeight;
  });
  doc.y = y + 18;
}

async function sendExcel(res, rows, filename) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Report');
  sheet.columns = Object.keys(rows[0] || { message: 'No data' }).map((key) => ({
    header: key.replaceAll('_', ' ').toUpperCase(),
    key,
    width: 24
  }));
  rows.forEach((row) => sheet.addRow(row));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

function sendPdf(res, { title, range, rows, columns, cards, totals, filename }) {
  const doc = new PDFDocument({ margin: 36, size: 'A4', bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);
  addHeader(doc, title, range);
  addSummaryCards(doc, cards);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Report Details');
  doc.moveDown(0.8);
  addTable(doc, columns, rows);
  if (doc.y > 720) doc.addPage();
  doc.moveDown(0.5);
  const totalsY = doc.y;
  doc.roundedRect(36, doc.y, 523, 48, 6).fillAndStroke('#ecfeff', '#99f6e4');
  doc.fillColor('#0f766e').font('Helvetica-Bold').fontSize(10).text('Totals', 52, totalsY + 9);
  doc.fillColor('#111827').font('Helvetica').fontSize(9).text(totals, 52, totalsY + 27, { width: 490, height: 14, ellipsis: true });
  addFooter(doc);
  doc.end();
}

function dateRange(queryParams = {}) {
  const period = queryParams.period || 'month';
  const today = new Date().toISOString().slice(0, 10);
  if (period === 'day') {
    const day = queryParams.date || today;
    return { label: day, start: day, endSql: ':start' };
  }
  if (period === 'week') {
    const day = queryParams.date || today;
    return { label: `Week of ${day}`, start: day, endSql: 'DATE_ADD(:start, INTERVAL 6 DAY)' };
  }
  const range = monthRange(queryParams.month);
  return { label: range.month, start: range.start, endSql: 'LAST_DAY(:start)' };
}

function reportColumns(rows) {
  const keys = Object.keys(rows[0] || { message: 'No data' }).slice(0, 8);
  const width = Math.floor(523 / keys.length);
  return keys.map((key, index) => ({
    label: key.replaceAll('_', ' ').toUpperCase(),
    width: index === keys.length - 1 ? 523 - width * (keys.length - 1) : width,
    value: (row) => {
      const value = row[key];
      if (key.includes('amount') || key.includes('commission') || key.includes('price')) return money(value);
      if (key.includes('date') || key.includes('time') || key.includes('_at')) return fmtDate(value);
      return value ?? '-';
    }
  }));
}

function advancedReportTitle(type) {
  return {
    complete_monthly_orders: 'Complete Monthly Order Report',
    return_monthly_orders: 'Return Monthly Order Report',
    cancel_monthly_orders: 'Cancel Monthly Order Report',
    closed_orders_report: 'Completed / Cancelled / Removed Orders Report',
    co_admin_performance: 'CO_ADMIN Performance Report',
    production_performance: 'Production Employee Performance Report',
    co_admin_commissions: 'CO_ADMIN Commission Report',
    production_commissions: 'Production Employee Commission Report',
    daily_attendance: 'Daily Attendance Report',
    attendance: 'Attendance Report'
  }[type] || 'Advanced Report';
}

function advancedFilters(queryParams, extra = {}) {
  const clauses = [];
  const params = {};
  if (queryParams.employee_id) {
    clauses.push(`${extra.employeeAlias || 'e'}.id = :employeeId`);
    params.employeeId = queryParams.employee_id;
  }
  if (queryParams.status) {
    clauses.push(`${extra.statusAlias || 's'}.name = :status`);
    params.status = queryParams.status;
  }
  return { clauses, params };
}

async function ensureCourierReportSupport() {
  await query(`CREATE TABLE IF NOT EXISTS courier_services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    phone VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  const columns = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'orders'
       AND COLUMN_NAME IN ('courier_service_id', 'tracking_number')`
  );
  const existing = new Set(columns.map((column) => column.COLUMN_NAME));
  if (!existing.has('courier_service_id')) {
    await query('ALTER TABLE orders ADD COLUMN courier_service_id INT NULL AFTER facebook_page_id');
  }
  if (!existing.has('tracking_number')) {
    await query('ALTER TABLE orders ADD COLUMN tracking_number VARCHAR(120) NULL AFTER courier_service_id');
  }
}

async function orderReportRows(type, queryParams = {}) {
  await ensureCourierReportSupport();
  const range = monthRange(queryParams.month);
  const filters = advancedFilters(queryParams, { statusAlias: 's' });
  const statusClause = {
    complete_monthly_orders: "LOWER(s.name) IN ('complete', 'completed')",
    return_monthly_orders: "LOWER(s.name) IN ('return', 'returned')",
    cancel_monthly_orders: "LOWER(s.name) IN ('cancel', 'cancelled', 'canceled')",
    closed_orders_report: "(LOWER(s.name) IN ('complete', 'completed', 'cancel', 'cancelled', 'canceled') OR COALESCE(o.archived_from_active_list, FALSE) = TRUE)"
  }[type];
  const reportDateExpression = ['complete_monthly_orders', 'return_monthly_orders', 'cancel_monthly_orders', 'closed_orders_report'].includes(type)
    ? 'DATE(COALESCE(o.updated_at, o.created_at))'
    : 'DATE(o.created_at)';
  const where = [statusClause, `${reportDateExpression} BETWEEN :start AND LAST_DAY(:start)`, ...filters.clauses].join(' AND ');
  return query(
    `SELECT
      CASE
        WHEN COALESCE(o.archived_from_active_list, FALSE) = TRUE THEN 'Removed from active list'
        WHEN LOWER(s.name) IN ('complete', 'completed') THEN 'Complete'
        WHEN LOWER(s.name) IN ('return', 'returned') THEN 'Return'
        WHEN LOWER(s.name) IN ('cancel', 'cancelled', 'canceled') THEN 'Cancel'
        ELSE s.name
      END AS report_type,
      o.order_number, c.name AS customer_name, c.phone AS customer_phone,
      p.name AS product_name, o.order_quantity, s.name AS order_status,
      e.name AS assigned_employee, creator.name AS created_by_name,
      cs.name AS courier_service, o.tracking_number,
      o.total_amount, o.created_at, o.updated_at, o.deleted_at
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN products p ON p.id = o.product_id
     JOIN order_statuses s ON s.id = o.status_id
     LEFT JOIN courier_services cs ON cs.id = o.courier_service_id
     LEFT JOIN employees e ON e.id = o.assigned_employee_id
     LEFT JOIN employees creator ON creator.id = o.created_by
     WHERE ${where}
     ORDER BY o.created_at DESC`,
    { start: range.start, ...filters.params }
  );
}

async function rolePerformanceRows(role, queryParams = {}) {
  const range = monthRange(queryParams.month);
  const roleValues = Array.isArray(role) ? role : [role];
  const rolePlaceholders = roleValues.map((_, index) => `:role${index}`).join(', ');
  const roleParams = Object.fromEntries(roleValues.map((value, index) => [`role${index}`, value]));
  const personJoin = roleValues.includes('CO_ADMIN') && roleValues.length === 1
    ? 'LEFT JOIN order_assignments oa ON oa.assigned_by_admin_id = e.id LEFT JOIN orders o ON o.id = oa.order_id AND DATE(o.created_at) BETWEEN :start AND LAST_DAY(:start)'
    : 'LEFT JOIN orders o ON o.assigned_employee_id = e.id AND DATE(o.created_at) BETWEEN :start AND LAST_DAY(:start)';
  return query(
    `SELECT e.id, e.name AS user_name, e.email, r.name AS role,
      COUNT(DISTINCT CASE WHEN LOWER(s.name) = 'completed' THEN o.id END) AS completed_orders,
      COUNT(DISTINCT CASE WHEN LOWER(s.name) = 'pending' THEN o.id END) AS pending_orders,
      COUNT(DISTINCT CASE WHEN LOWER(s.name) IN ('return', 'returned') THEN o.id END) AS return_orders,
      COUNT(DISTINCT CASE WHEN LOWER(s.name) IN ('cancel', 'cancelled', 'canceled') THEN o.id END) AS cancelled_orders,
      COUNT(DISTINCT CASE WHEN LOWER(s.name) = 'rearrange' THEN o.id END) AS rearrange_orders,
      COUNT(DISTINCT o.id) AS total_assigned_orders
     FROM employees e
     JOIN roles r ON r.id = e.role_id
     ${personJoin}
     LEFT JOIN order_statuses s ON s.id = o.status_id
     WHERE r.name IN (${rolePlaceholders}) AND e.deleted_at IS NULL
     GROUP BY e.id, r.name
     ORDER BY completed_orders DESC, total_assigned_orders DESC`,
    { start: range.start, ...roleParams }
  );
}

async function roleCommissionRows(role, queryParams = {}, currentUser = null) {
  const range = monthRange(queryParams.month);
  const roleValues = Array.isArray(role) ? role : [role];
  const rolePlaceholders = roleValues.map((_, index) => `:role${index}`).join(', ');
  const roleParams = Object.fromEntries(roleValues.map((value, index) => [`role${index}`, value]));
  const scopedToCurrentCoAdmin = currentUser?.role === 'CO_ADMIN' && roleValues.includes('CO_ADMIN') && roleValues.length === 1;
  const params = { start: range.start, ...roleParams };
  if (scopedToCurrentCoAdmin) params.currentEmployeeId = currentUser.id;
  return query(
    `SELECT e.name AS employee_name, e.email, r.name AS role, o.order_number,
      s.name AS order_status, c.user_role, c.commission_type,
      COALESCE(c.commission_amount, 0) AS total_commission,
      CASE WHEN c.is_payable THEN c.commission_amount ELSE 0 END AS payable_commission,
      CASE WHEN c.cancelled_at IS NOT NULL THEN c.commission_amount ELSE 0 END AS cancelled_commission,
      c.cancelled_reason, c.cancelled_at, c.assignment_started_at
     FROM commissions c
     JOIN employees e ON e.id = c.employee_id
     JOIN roles r ON r.id = e.role_id
     JOIN orders o ON o.id = c.order_id
     JOIN order_statuses s ON s.id = o.status_id
     WHERE r.name IN (${rolePlaceholders})
       AND DATE(c.assignment_started_at) BETWEEN :start AND LAST_DAY(:start)
       ${scopedToCurrentCoAdmin ? 'AND e.id = :currentEmployeeId' : ''}
     ORDER BY e.name, c.assignment_started_at DESC`,
    params
  );
}

async function attendanceRows(queryParams = {}) {
  const range = dateRange(queryParams);
  const filters = advancedFilters(queryParams, { employeeAlias: 'e' });
  const roleClause = queryParams.role ? 'AND r.name = :role' : "AND r.name IN ('CO_ADMIN', 'PRODUCTION_EMPLOYEE', 'DESIGN_TEAM')";
  return query(
    `SELECT e.name AS employee_name, e.email, r.name AS role,
      a.attendance_date, a.login_time, a.logout_time, a.logout_status,
      CASE WHEN a.logout_time IS NULL THEN 'Pending logout' ELSE 'Completed' END AS attendance_status
     FROM attendance_logs a
     JOIN employees e ON e.id = a.employee_id
     JOIN roles r ON r.id = e.role_id
     WHERE a.attendance_date BETWEEN :start AND ${range.endSql}
       ${roleClause}
       AND r.name <> 'OWNER'
       ${filters.clauses.length ? `AND ${filters.clauses.join(' AND ')}` : ''}
     ORDER BY a.attendance_date DESC, a.login_time DESC`,
    { start: range.start, role: queryParams.role, ...filters.params }
  );
}

async function advancedRows(type, queryParams = {}, currentUser = null) {
  if (['complete_monthly_orders', 'return_monthly_orders', 'cancel_monthly_orders', 'closed_orders_report'].includes(type)) return orderReportRows(type, queryParams);
  if (type === 'co_admin_performance') return rolePerformanceRows('CO_ADMIN', queryParams);
  if (type === 'production_performance') return rolePerformanceRows(['PRODUCTION_EMPLOYEE', 'DESIGN_TEAM'], queryParams);
  if (type === 'co_admin_commissions') return roleCommissionRows('CO_ADMIN', queryParams, currentUser);
  if (type === 'production_commissions') return roleCommissionRows(['PRODUCTION_EMPLOYEE', 'DESIGN_TEAM'], queryParams, currentUser);
  if (type === 'daily_attendance' || type === 'attendance') return attendanceRows({ ...queryParams, period: queryParams.period || 'day' });
  const error = new Error('Unknown report type.');
  error.status = 404;
  throw error;
}

router.get('/advanced/:type', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    res.json(await advancedRows(req.params.type, req.query, req.user));
  } catch (error) {
    next(error);
  }
});

router.get('/advanced/:type/excel', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    await sendExcel(res, await advancedRows(req.params.type, req.query, req.user), req.params.type);
  } catch (error) {
    next(error);
  }
});

router.get('/advanced/:type/pdf', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    const rows = await advancedRows(req.params.type, req.query, req.user);
    const range = { month: req.query.month || req.query.date || new Date().toISOString().slice(0, 10) };
    sendPdf(res, {
      title: advancedReportTitle(req.params.type),
      range,
      rows,
      filename: req.params.type,
      cards: [
        { label: 'Rows', value: rows.length },
        { label: 'Report', value: advancedReportTitle(req.params.type).slice(0, 18) },
        { label: 'Generated', value: new Date().toISOString().slice(0, 10) },
        { label: 'Filter', value: req.query.role || req.query.status || 'All' }
      ],
      totals: `Rows: ${rows.length}`,
      columns: reportColumns(rows)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/commissions', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    res.json(await commissionRows(req.query, req.user));
  } catch (error) {
    next(error);
  }
});

router.get('/performance', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    res.json(await performanceRows(req.query, req.user));
  } catch (error) {
    next(error);
  }
});

router.get('/commissions/excel', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    await sendExcel(res, await commissionRows(req.query, req.user), 'monthly-commission-report');
  } catch (error) {
    next(error);
  }
});

router.get('/performance/excel', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    await sendExcel(res, await performanceRows(req.query, req.user), 'employee-performance-report');
  } catch (error) {
    next(error);
  }
});

router.get('/commissions/pdf', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    const range = monthRange(req.query.month);
    const rows = await commissionRows(req.query, req.user);
    const grandTotal = rows.reduce((sum, row) => sum + Number(row.commission_amount || 0), 0);
    sendPdf(res, {
      title: 'Monthly Commission Report',
      range,
      rows,
      filename: 'monthly-commission-report',
      cards: [
        { label: 'Records', value: rows.length },
        { label: 'Employees', value: new Set(rows.map((row) => row.email)).size },
        { label: 'Payable', value: rows.filter((row) => row.is_payable).length },
        { label: 'Grand Total', value: money(grandTotal) }
      ],
      totals: `Grand Total Commission: ${money(grandTotal)}`,
      columns: [
        { label: 'Employee', width: 82, value: (row) => row.employee_name },
        { label: 'Role', width: 62, value: (row) => row.employee_role },
        { label: 'Order', width: 72, value: (row) => row.order_number },
        { label: 'Amount', width: 60, value: (row) => money(row.commission_amount) },
        { label: 'Month Total', width: 72, value: (row) => money(row.total_monthly_commission) },
        { label: 'Orders', width: 38, value: (row) => row.orders_count },
        { label: 'Latest', width: 58, value: (row) => row.latest_order_status || '-' },
        { label: 'Started', width: 72, value: (row) => fmtDate(row.assignment_started_at) },
        { label: 'Assigned By', width: 79, value: (row) => `${row.assigned_by_name || '-'} (${row.assigned_by_role || '-'})` }
      ]
    });
  } catch (error) {
    next(error);
  }
});

router.get('/performance/pdf', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    const range = monthRange(req.query.month);
    const rows = await performanceRows(req.query, req.user);
    const totalCommission = rows.reduce((sum, row) => sum + Number(row.commission_total || 0), 0);
    const completed = rows.reduce((sum, row) => sum + Number(row.completed_orders || 0), 0);
    sendPdf(res, {
      title: 'Employee Performance Report',
      range,
      rows,
      filename: 'employee-performance-report',
      cards: [
        { label: 'Employees', value: rows.length },
        { label: 'Completed', value: completed },
        { label: 'Top Rank', value: rows[0]?.employee_name || '-' },
        { label: 'Commission', value: money(totalCommission) }
      ],
      totals: `Completed Orders: ${completed} | Total Commission: ${money(totalCommission)}`,
      columns: [
        { label: 'Rank', width: 32, value: (row) => row.performance_rank },
        { label: 'Employee', width: 90, value: (row) => row.employee_name },
        { label: 'Email', width: 110, value: (row) => row.email },
        { label: 'Role', width: 72, value: (row) => row.employee_role },
        { label: 'Completed', width: 55, value: (row) => row.completed_orders },
        { label: 'Fast', width: 38, value: (row) => row.fast_orders_completed },
        { label: 'Avg Hrs', width: 48, value: (row) => row.average_completion_hours || 0 },
        { label: 'Commission', width: 78, value: (row) => money(row.commission_total) }
      ]
    });
  } catch (error) {
    next(error);
  }
});

router.post('/performance/snapshot', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    const range = monthRange(req.query.month);
    const rows = await performanceRows(req.query, req.user);
    const employees = await query('SELECT id, email FROM employees');
    const idByEmail = Object.fromEntries(employees.map((employee) => [employee.email, employee.id]));

    await Promise.all(rows.map((row) => query(
      `INSERT INTO employee_performance (
        employee_id, period_start, period_end, completed_orders, fast_orders_completed,
        average_completion_hours, commission_total
      ) VALUES (:employeeId, :periodStart, LAST_DAY(:periodStart), :completed, :fast, :hours, :commission)
      ON DUPLICATE KEY UPDATE
        completed_orders = VALUES(completed_orders),
        fast_orders_completed = VALUES(fast_orders_completed),
        average_completion_hours = VALUES(average_completion_hours),
        commission_total = VALUES(commission_total),
        generated_at = CURRENT_TIMESTAMP`,
      {
        employeeId: idByEmail[row.email],
        periodStart: range.start,
        completed: row.completed_orders || 0,
        fast: row.fast_orders_completed || 0,
        hours: row.average_completion_hours || 0,
        commission: row.commission_total || 0
      }
    )));

    res.json({ message: 'Employee performance snapshot generated.', rows: rows.length });
  } catch (error) {
    next(error);
  }
});

export default router;
