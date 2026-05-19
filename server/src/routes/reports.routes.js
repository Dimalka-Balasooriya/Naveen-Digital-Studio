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

async function commissionRows(queryParams = {}) {
  const range = monthRange(queryParams.month);
  const filters = buildFilters(queryParams);
  const where = filters.clauses.length ? `AND ${filters.clauses.join(' AND ')}` : '';
  return query(
    `SELECT e.name AS employee_name, e.email, r.name AS employee_role, o.order_number,
      o.order_quantity, c.commission_amount, c.is_payable, c.paid_at,
      c.assignment_started_at, c.assignment_ended_at, admin.name AS assigned_by_name,
      COALESCE(oa.assigned_by_role, 'OWNER') AS assigned_by_role
     FROM commissions c
     JOIN employees e ON e.id = c.employee_id
     JOIN roles r ON r.id = e.role_id
     JOIN orders o ON o.id = c.order_id
     JOIN order_statuses s ON s.id = o.status_id
     LEFT JOIN order_assignments oa ON oa.order_id = o.id AND oa.assigned_to_employee_id = e.id
     LEFT JOIN employees admin ON admin.id = COALESCE(oa.assigned_by_admin_id, c.assigned_by)
     WHERE DATE(c.assignment_started_at) BETWEEN :start AND LAST_DAY(:start)
     ${where}
     ORDER BY e.name, c.assignment_started_at`,
    { start: range.start, ...filters.params }
  );
}

async function performanceRows(queryParams = {}) {
  const range = monthRange(queryParams.month);
  const filters = buildFilters(queryParams);
  const where = filters.clauses.length ? `AND ${filters.clauses.join(' AND ')}` : '';
  const rows = await query(
    `SELECT e.id, e.name AS employee_name, e.email, r.name AS employee_role,
      COALESCE(SUM(CASE WHEN s.name = 'Completed' THEN o.order_quantity ELSE 0 END), 0) AS completed_orders,
      COALESCE(SUM(CASE WHEN s.name = 'Completed' AND o.is_fast = TRUE THEN o.order_quantity ELSE 0 END), 0) AS fast_orders_completed,
      ROUND(AVG(CASE WHEN s.name = 'Completed' THEN TIMESTAMPDIFF(HOUR, o.created_at, o.updated_at) END), 2) AS average_completion_hours,
      COALESCE(SUM(c.commission_amount), 0) AS commission_total,
      MAX(admin.name) AS assigned_by_name,
      MAX(oa.assigned_by_role) AS assigned_by_role
     FROM employees e
     JOIN roles r ON r.id = e.role_id
     LEFT JOIN orders o ON o.assigned_employee_id = e.id AND DATE(o.updated_at) BETWEEN :start AND LAST_DAY(:start)
     LEFT JOIN order_statuses s ON s.id = o.status_id
     LEFT JOIN commissions c ON c.employee_id = e.id AND DATE(c.assignment_started_at) BETWEEN :start AND LAST_DAY(:start)
     LEFT JOIN order_assignments oa ON oa.assigned_to_employee_id = e.id
     LEFT JOIN employees admin ON admin.id = oa.assigned_by_admin_id
     WHERE r.name IN ('OWNER', 'CO_ADMIN', 'PRODUCTION_EMPLOYEE', 'admin', 'production')
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
  const cardWidth = 122;
  cards.forEach((card, index) => {
    const x = 36 + index * 132;
    doc.roundedRect(x, doc.y, cardWidth, 54, 6).fillAndStroke('#f8fafc', '#e5e7eb');
    doc.fillColor('#64748b').fontSize(8).text(card.label, x + 10, doc.y + 10, { width: cardWidth - 20 });
    doc.fillColor('#111827').fontSize(13).text(String(card.value), x + 10, doc.y + 27, { width: cardWidth - 20 });
  });
  doc.y += 76;
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
  const rowHeight = 26;
  let y = doc.y;
  const drawHeader = () => {
    doc.rect(startX, y, 523, rowHeight).fill('#e2e8f0');
    let x = startX;
    columns.forEach((column) => {
      doc.fillColor('#0f172a').fontSize(8).text(column.label, x + 4, y + 8, { width: column.width - 8 });
      x += column.width;
    });
    y += rowHeight;
  };

  drawHeader();
  rows.forEach((row, index) => {
    if (y > 780) {
      doc.addPage();
      y = 44;
      drawHeader();
    }
    doc.rect(startX, y, 523, rowHeight).fill(index % 2 ? '#ffffff' : '#f8fafc').stroke('#e5e7eb');
    let x = startX;
    columns.forEach((column) => {
      doc.fillColor('#111827').fontSize(7.5).text(String(column.value(row) ?? '-'), x + 4, y + 7, {
        width: column.width - 8,
        height: rowHeight - 8,
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
  doc.fontSize(12).fillColor('#111827').text('Report Details');
  doc.moveDown(0.8);
  addTable(doc, columns, rows);
  doc.moveDown();
  doc.roundedRect(36, doc.y, 523, 48, 6).fillAndStroke('#ecfeff', '#99f6e4');
  doc.fillColor('#0f766e').fontSize(11).text('Totals', 52, doc.y + 10);
  doc.fillColor('#111827').fontSize(10).text(totals, 52, doc.y + 27, { width: 490 });
  addFooter(doc);
  doc.end();
}

router.get('/commissions', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    res.json(await commissionRows(req.query));
  } catch (error) {
    next(error);
  }
});

router.get('/performance', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    res.json(await performanceRows(req.query));
  } catch (error) {
    next(error);
  }
});

router.get('/commissions/excel', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    await sendExcel(res, await commissionRows(req.query), 'monthly-commission-report');
  } catch (error) {
    next(error);
  }
});

router.get('/performance/excel', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    await sendExcel(res, await performanceRows(req.query), 'employee-performance-report');
  } catch (error) {
    next(error);
  }
});

router.get('/commissions/pdf', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    const range = monthRange(req.query.month);
    const rows = await commissionRows(req.query);
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
        { label: 'Order', width: 72, value: (row) => row.order_number },
        { label: 'Qty', width: 28, value: (row) => row.order_quantity },
        { label: 'Amount', width: 62, value: (row) => money(row.commission_amount) },
        { label: 'Payable', width: 46, value: (row) => row.is_payable ? 'Yes' : 'No' },
        { label: 'Started', width: 72, value: (row) => fmtDate(row.assignment_started_at) },
        { label: 'Ended', width: 58, value: (row) => fmtDate(row.assignment_ended_at) },
        { label: 'Assigned By', width: 103, value: (row) => `${row.assigned_by_name || '-'} (${row.assigned_by_role || '-'})` }
      ]
    });
  } catch (error) {
    next(error);
  }
});

router.get('/performance/pdf', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    const range = monthRange(req.query.month);
    const rows = await performanceRows(req.query);
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
    const rows = await performanceRows(req.query);
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
