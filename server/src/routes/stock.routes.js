import { Router } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { authenticate, requireAdminOrCoAdmin, requireOwner, requireProductionOrAdmin } from '../middleware/auth.js';
import { query } from '../config/db.js';

const router = Router();

router.use(authenticate);

let hasCheckedStockTables = false;

async function ensureStockTables() {
  if (hasCheckedStockTables) return;

  await query(`
    CREATE TABLE IF NOT EXISTS stock_catalog_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      item_name VARCHAR(160) NOT NULL,
      item_code VARCHAR(40) NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INT NULL,
      updated_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_stock_catalog_created_by FOREIGN KEY (created_by) REFERENCES employees(id),
      CONSTRAINT fk_stock_catalog_updated_by FOREIGN KEY (updated_by) REFERENCES employees(id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS stock_branches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      branch_name VARCHAR(120) NOT NULL,
      short_code VARCHAR(30) NOT NULL UNIQUE,
      quantity INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INT NULL,
      updated_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_stock_branches_created_by FOREIGN KEY (created_by) REFERENCES employees(id),
      CONSTRAINT fk_stock_branches_updated_by FOREIGN KEY (updated_by) REFERENCES employees(id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      branch_id INT NOT NULL,
      item_id INT NULL,
      movement_type ENUM('ADD', 'REDUCE', 'CREATE', 'EDIT', 'DELETE') NOT NULL,
      quantity_change INT NOT NULL DEFAULT 0,
      previous_quantity INT NOT NULL DEFAULT 0,
      new_quantity INT NOT NULL DEFAULT 0,
      note VARCHAR(255) NULL,
      changed_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_stock_movements_branch FOREIGN KEY (branch_id) REFERENCES stock_branches(id),
      CONSTRAINT fk_stock_movements_changed_by FOREIGN KEY (changed_by) REFERENCES employees(id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS stock_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      branch_id INT NOT NULL,
      item_name VARCHAR(160) NOT NULL,
      item_code VARCHAR(40) NOT NULL,
      quantity INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INT NULL,
      updated_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT uq_stock_items_branch_code UNIQUE (branch_id, item_code),
      CONSTRAINT fk_stock_items_branch FOREIGN KEY (branch_id) REFERENCES stock_branches(id),
      CONSTRAINT fk_stock_items_created_by FOREIGN KEY (created_by) REFERENCES employees(id),
      CONSTRAINT fk_stock_items_updated_by FOREIGN KEY (updated_by) REFERENCES employees(id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS stock_bills (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bill_number VARCHAR(40) NOT NULL UNIQUE,
      stock_item_id INT NOT NULL,
      branch_id INT NOT NULL,
      item_name VARCHAR(160) NOT NULL,
      item_code VARCHAR(40) NOT NULL,
      branch_name VARCHAR(120) NOT NULL,
      branch_code VARCHAR(30) NOT NULL,
      quantity_at_bill INT NOT NULL DEFAULT 0,
      amount DECIMAL(12,2) NOT NULL,
      customer_name VARCHAR(160) NULL,
      note VARCHAR(255) NULL,
      generated_by INT NOT NULL,
      generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_stock_bills_item FOREIGN KEY (stock_item_id) REFERENCES stock_items(id),
      CONSTRAINT fk_stock_bills_branch FOREIGN KEY (branch_id) REFERENCES stock_branches(id),
      CONSTRAINT fk_stock_bills_generated_by FOREIGN KEY (generated_by) REFERENCES employees(id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS stock_wholesale_bills (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bill_number VARCHAR(40) NOT NULL UNIQUE,
      customer_name VARCHAR(160) NULL,
      note VARCHAR(255) NULL,
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      generated_by INT NOT NULL,
      generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_stock_wholesale_bills_generated_by FOREIGN KEY (generated_by) REFERENCES employees(id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS stock_wholesale_bill_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bill_id INT NOT NULL,
      stock_item_id INT NULL,
      item_name VARCHAR(160) NOT NULL,
      item_code VARCHAR(40) NULL,
      branch_name VARCHAR(120) NULL,
      branch_code VARCHAR(30) NULL,
      quantity INT NOT NULL,
      unit_price DECIMAL(12,2) NOT NULL,
      line_total DECIMAL(12,2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_stock_wholesale_items_bill FOREIGN KEY (bill_id) REFERENCES stock_wholesale_bills(id),
      CONSTRAINT fk_stock_wholesale_items_stock FOREIGN KEY (stock_item_id) REFERENCES stock_items(id)
    )
  `);

  const columns = await query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'stock_movements'
       AND COLUMN_NAME = 'item_id'`
  );
  if (!columns.length) {
    await query('ALTER TABLE stock_movements ADD COLUMN item_id INT NULL AFTER branch_id');
  }

  const catalogPriceColumn = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_catalog_items' AND COLUMN_NAME = 'unit_price'`
  );
  if (!catalogPriceColumn.length) {
    await query('ALTER TABLE stock_catalog_items ADD COLUMN unit_price DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER item_code');
  }

  const stockPriceColumn = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_items' AND COLUMN_NAME = 'unit_price'`
  );
  if (!stockPriceColumn.length) {
    await query('ALTER TABLE stock_items ADD COLUMN unit_price DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER quantity');
  }

  await query(`
    INSERT INTO stock_branches (branch_name, short_code, quantity)
    SELECT 'Kurunegala Branch', 'KUR', 0
    WHERE NOT EXISTS (SELECT 1 FROM stock_branches WHERE short_code = 'KUR')
  `);

  await query(`
    INSERT INTO stock_branches (branch_name, short_code, quantity)
    SELECT 'Galgamuwa Branch', 'GAL', 0
    WHERE NOT EXISTS (SELECT 1 FROM stock_branches WHERE short_code = 'GAL')
  `);

  hasCheckedStockTables = true;
}

const branchSchema = z.object({
  branch_name: z.string().min(2, 'Branch name is required.'),
  short_code: z.string().min(2, 'Short code is required.'),
  quantity: z.coerce.number().int().min(0, 'Quantity must be zero or more.').optional()
});

const itemSchema = z.object({
  item_name: z.string().min(2, 'Item name is required.'),
  item_code: z.string().min(2, 'Item code is required.'),
  quantity: z.coerce.number().int().min(0, 'Quantity must be zero or more.').optional(),
  unit_price: z.coerce.number().min(0, 'Price must be zero or more.').optional()
});

const catalogItemSchema = z.object({
  item_name: z.string().min(2, 'Item name is required.'),
  item_code: z.string().min(2, 'Item code is required.'),
  unit_price: z.coerce.number().min(0, 'Price must be zero or more.').optional()
});

const stockBillSchema = z.object({
  stock_item_id: z.coerce.number().int().positive('Please select a stock item.'),
  amount: z.coerce.number().positive('Bill amount must be greater than 0.'),
  customer_name: z.string().optional().nullable(),
  note: z.string().optional().nullable()
});

const wholesaleBillSchema = z.object({
  customer_name: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  items: z.array(z.object({
    stock_item_id: z.number().int().positive().optional().nullable(),
    item_name: z.string().min(1, 'Item name is required.'),
    item_code: z.string().optional().nullable(),
    branch_name: z.string().optional().nullable(),
    branch_code: z.string().optional().nullable(),
    quantity: z.coerce.number().int().positive('Quantity must be greater than 0.'),
    unit_price: z.coerce.number().min(0, 'Price must be zero or more.')
  })).min(1, 'Please add at least one bill item.')
});

const quantitySchema = z.object({
  type: z.enum(['ADD', 'REDUCE']),
  quantity: z.coerce.number().int().positive('Quantity must be greater than 0.'),
  note: z.string().optional().nullable()
});

function fmtDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' });
}

async function stockReportRows(branchId = null) {
  await ensureStockTables();
  const branchFilter = branchId ? 'AND b.id = :branch_id' : '';
  return query(
    `SELECT b.branch_name,
            b.short_code AS branch_code,
            i.item_name,
            i.item_code,
            i.quantity,
            COALESCE(NULLIF(i.unit_price, 0), c.unit_price, 0) AS unit_price,
            updater.name AS last_updated_by,
            i.updated_at
     FROM stock_branches b
     LEFT JOIN stock_items i ON i.branch_id = b.id AND i.is_active = TRUE
     LEFT JOIN stock_catalog_items c ON LOWER(c.item_code) = LOWER(i.item_code) AND c.is_active = TRUE
     LEFT JOIN employees updater ON updater.id = i.updated_by
     WHERE b.is_active = TRUE
     ${branchFilter}
     ORDER BY b.branch_name, i.item_name`,
    branchId ? { branch_id: branchId } : {}
  );
}

async function getStockBill(id) {
  await ensureStockTables();
  const rows = await query(
    `SELECT sb.*, e.name AS generated_by_name, r.name AS generated_by_role
     FROM stock_bills sb
     JOIN employees e ON e.id = sb.generated_by
     JOIN roles r ON r.id = e.role_id
     WHERE sb.id = :id
     LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function getWholesaleBill(id) {
  await ensureStockTables();
  const rows = await query(
    `SELECT wb.*, e.name AS generated_by_name, r.name AS generated_by_role
     FROM stock_wholesale_bills wb
     JOIN employees e ON e.id = wb.generated_by
     JOIN roles r ON r.id = e.role_id
     WHERE wb.id = :id
     LIMIT 1`,
    { id }
  );
  if (!rows.length) return null;
  const items = await query(
    `SELECT *
     FROM stock_wholesale_bill_items
     WHERE bill_id = :id
     ORDER BY id`,
    { id }
  );
  return { ...rows[0], items };
}

async function sendStockExcel(res, rows, filename) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Stock Report');
  sheet.columns = [
    { header: 'BRANCH', key: 'branch_name', width: 26 },
    { header: 'BRANCH CODE', key: 'branch_code', width: 14 },
    { header: 'ITEM NAME', key: 'item_name', width: 30 },
    { header: 'ITEM CODE', key: 'item_code', width: 18 },
    { header: 'QUANTITY', key: 'quantity', width: 12 },
    { header: 'UNIT PRICE', key: 'unit_price', width: 14 },
    { header: 'LAST UPDATED BY', key: 'last_updated_by', width: 24 },
    { header: 'UPDATED AT', key: 'updated_at', width: 24 }
  ];
  rows.forEach((row) => sheet.addRow({
    ...row,
    item_name: row.item_name || '-',
    item_code: row.item_code || '-',
    quantity: Number(row.quantity || 0),
    unit_price: Number(row.unit_price || 0),
    updated_at: fmtDate(row.updated_at)
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn('quantity').numFmt = '0';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

function sendStockPdf(res, { rows, title, filename, branchName = 'All Branches' }) {
  const doc = new PDFDocument({ margin: 36, size: 'A4', bufferPages: true });
  const totalItems = rows.filter((row) => row.item_name).length;
  const totalQuantity = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const branches = new Set(rows.map((row) => row.branch_code)).size;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);

  doc.rect(36, 32, 523, 78).fill('#172033');
  doc.fillColor('#5eead4').fontSize(10).text('NAVEEN DIGITAL STUDIO', 56, 48, { characterSpacing: 2 });
  doc.fillColor('#ffffff').fontSize(20).text(title, 56, 68);
  doc.fontSize(9).fillColor('#dbeafe').text(`Generated: ${fmtDate(new Date())}`, 378, 48, { width: 162, align: 'right' });
  doc.text(`Scope: ${branchName}`, 378, 66, { width: 162, align: 'right' });

  doc.y = 130;
  [
    ['Branches', branches],
    ['Items', totalItems],
    ['Total Quantity', totalQuantity]
  ].forEach(([label, value], index) => {
    const x = 36 + index * 170;
    doc.roundedRect(x, doc.y, 154, 52, 6).fillAndStroke('#f8fafc', '#e5e7eb');
    doc.fillColor('#64748b').fontSize(8).text(label, x + 10, doc.y + 10, { width: 134 });
    doc.fillColor('#111827').fontSize(14).text(String(value), x + 10, doc.y + 27, { width: 134 });
  });
  doc.y += 76;

  const columns = [
    { label: 'Branch', width: 112, value: (row) => row.branch_name },
    { label: 'Code', width: 58, value: (row) => row.branch_code },
    { label: 'Item', width: 128, value: (row) => row.item_name || '-' },
    { label: 'Item Code', width: 76, value: (row) => row.item_code || '-' },
    { label: 'Qty', width: 46, value: (row) => Number(row.quantity || 0) },
    { label: 'Price', width: 56, value: (row) => `Rs. ${Number(row.unit_price || 0).toLocaleString()}` },
    { label: 'Updated', width: 47, value: (row) => fmtDate(row.updated_at) }
  ];
  const rowHeight = 28;
  let y = doc.y;
  const drawHeader = () => {
    doc.rect(36, y, 523, rowHeight).fill('#e2e8f0');
    let x = 36;
    columns.forEach((column) => {
      doc.fillColor('#0f172a').fontSize(8).text(column.label, x + 4, y + 9, { width: column.width - 8 });
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
    doc.rect(36, y, 523, rowHeight).fill(index % 2 ? '#ffffff' : '#f8fafc').stroke('#e5e7eb');
    let x = 36;
    columns.forEach((column) => {
      doc.fillColor('#111827').fontSize(7.5).text(String(column.value(row)), x + 4, y + 7, {
        width: column.width - 8,
        height: rowHeight - 8,
        ellipsis: true
      });
      x += column.width;
    });
    y += rowHeight;
  });

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor('#64748b')
      .text('Naveen Digital Studio', 36, 810)
      .text(`Page ${i + 1} of ${pages.count}`, 470, 810, { width: 90, align: 'right' });
  }
  doc.end();
}

function sendStockBillPdf(res, bill) {
  const doc = new PDFDocument({ margin: 42, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${bill.bill_number}.pdf"`);
  doc.pipe(res);

  doc.roundedRect(42, 36, 511, 88, 8).fill('#0f172a');
  doc.fillColor('#5eead4').fontSize(10).text('NAVEEN DIGITAL STUDIO', 62, 54, { characterSpacing: 2 });
  doc.fillColor('#ffffff').fontSize(24).text('Stock Bill', 62, 76);
  doc.fillColor('#cbd5e1').fontSize(9).text(`Generated: ${fmtDate(bill.generated_at)}`, 366, 56, { width: 166, align: 'right' });
  doc.text(`Bill No: ${bill.bill_number}`, 366, 74, { width: 166, align: 'right' });

  doc.y = 154;
  doc.fillColor('#0f172a').fontSize(12).text('Bill Details', 42, doc.y);
  doc.moveDown(0.7);
  const startY = doc.y;
  doc.roundedRect(42, startY, 511, 166, 8).fillAndStroke('#f8fafc', '#e2e8f0');
  const details = [
    ['Customer', bill.customer_name || '-'],
    ['Branch', `${bill.branch_name} (${bill.branch_code})`],
    ['Item', bill.item_name],
    ['Item Code', bill.item_code],
    ['Available Quantity', String(bill.quantity_at_bill)],
    ['Generated By', `${bill.generated_by_name} (${bill.generated_by_role})`],
    ['Note', bill.note || '-']
  ];
  let y = startY + 18;
  details.forEach(([label, value], index) => {
    const x = index % 2 === 0 ? 62 : 306;
    if (index > 0 && index % 2 === 0) y += 38;
    doc.fillColor('#64748b').fontSize(8).text(label, x, y, { width: 210 });
    doc.fillColor('#0f172a').fontSize(11).text(String(value), x, y + 13, { width: 210, height: 24, ellipsis: true });
  });

  doc.y = startY + 198;
  doc.roundedRect(42, doc.y, 511, 70, 8).fillAndStroke('#ecfeff', '#99f6e4');
  doc.fillColor('#0f766e').fontSize(10).text('Bill Amount', 62, doc.y + 16);
  doc.fillColor('#0f172a').fontSize(24).text(`Rs. ${Number(bill.amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 62, doc.y + 32);

  doc.fontSize(8).fillColor('#64748b')
    .text('This bill does not reduce stock quantity automatically.', 42, 760, { align: 'center', width: 511 })
    .text('Naveen Digital Studio', 42, 794, { align: 'center', width: 511 });
  doc.end();
}

function sendWholesaleBillPdf(res, bill) {
  const doc = new PDFDocument({ margin: 38, size: 'A4', bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${bill.bill_number}.pdf"`);
  doc.pipe(res);

  doc.roundedRect(38, 32, 519, 88, 8).fill('#0f172a');
  doc.fillColor('#5eead4').fontSize(10).text('NAVEEN DIGITAL STUDIO', 58, 50, { characterSpacing: 2 });
  doc.fillColor('#ffffff').fontSize(23).text('Wholesale Stock Bill', 58, 72);
  doc.fillColor('#cbd5e1').fontSize(9).text(`Generated: ${fmtDate(bill.generated_at)}`, 360, 52, { width: 176, align: 'right' });
  doc.text(`Bill No: ${bill.bill_number}`, 360, 70, { width: 176, align: 'right' });

  doc.y = 145;
  doc.roundedRect(38, doc.y, 519, 58, 8).fillAndStroke('#f8fafc', '#e2e8f0');
  doc.fillColor('#64748b').fontSize(8).text('Customer', 58, doc.y + 13);
  doc.fillColor('#0f172a').fontSize(11).text(bill.customer_name || '-', 58, doc.y + 27, { width: 210 });
  doc.fillColor('#64748b').fontSize(8).text('Generated By', 320, doc.y + 13, { width: 210, align: 'right' });
  doc.fillColor('#0f172a').fontSize(11).text(`${bill.generated_by_name} (${bill.generated_by_role})`, 320, doc.y + 27, { width: 210, align: 'right' });

  let y = 230;
  const columns = [
    { label: 'Item', width: 172 },
    { label: 'Code', width: 70 },
    { label: 'Branch', width: 96 },
    { label: 'Qty', width: 42 },
    { label: 'Price', width: 66 },
    { label: 'Total', width: 73 }
  ];
  const drawHeader = () => {
    doc.rect(38, y, 28 + 0, 0);
    doc.rect(38, y, 519, 28).fill('#e2e8f0');
    let x = 38;
    columns.forEach((column) => {
      doc.fillColor('#0f172a').fontSize(8).text(column.label, x + 5, y + 10, { width: column.width - 10 });
      x += column.width;
    });
    y += 28;
  };
  drawHeader();

  bill.items.forEach((item, index) => {
    if (y > 760) {
      doc.addPage();
      y = 44;
      drawHeader();
    }
    doc.rect(38, y, 519, 32).fill(index % 2 ? '#ffffff' : '#f8fafc').stroke('#e5e7eb');
    const values = [
      item.item_name,
      item.item_code || '-',
      item.branch_name || '-',
      item.quantity,
      `Rs. ${Number(item.unit_price || 0).toLocaleString()}`,
      `Rs. ${Number(item.line_total || 0).toLocaleString()}`
    ];
    let x = 38;
    columns.forEach((column, columnIndex) => {
      doc.fillColor('#111827').fontSize(8).text(String(values[columnIndex]), x + 5, y + 9, {
        width: column.width - 10,
        height: 18,
        ellipsis: true,
        align: columnIndex >= 3 ? 'right' : 'left'
      });
      x += column.width;
    });
    y += 32;
  });

  if (y > 704) {
    doc.addPage();
    y = 58;
  }
  doc.roundedRect(344, y + 24, 213, 58, 8).fillAndStroke('#ecfeff', '#99f6e4');
  doc.fillColor('#0f766e').fontSize(9).text('Grand Total', 362, y + 39);
  doc.fillColor('#0f172a').fontSize(20).text(`Rs. ${Number(bill.total_amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 362, y + 54, { width: 176, align: 'right' });
  if (bill.note) {
    doc.fillColor('#64748b').fontSize(9).text(`Note: ${bill.note}`, 38, y + 30, { width: 280 });
  }

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor('#64748b')
      .text('Stock is not reduced automatically by this wholesale bill.', 38, 794, { width: 360 })
      .text(`Page ${i + 1} of ${pages.count}`, 478, 794, { width: 80, align: 'right' });
  }
  doc.end();
}

router.get('/branches', requireProductionOrAdmin, async (req, res, next) => {
  try {
    await ensureStockTables();
    const rows = await query(
      `SELECT b.*,
              COALESCE(SUM(CASE WHEN i.is_active = TRUE THEN i.quantity ELSE 0 END), b.quantity, 0) AS quantity,
              COUNT(CASE WHEN i.is_active = TRUE THEN i.id END) AS item_count,
              creator.name AS created_by_name,
              updater.name AS updated_by_name
       FROM stock_branches b
       LEFT JOIN employees creator ON creator.id = b.created_by
       LEFT JOIN employees updater ON updater.id = b.updated_by
       LEFT JOIN stock_items i ON i.branch_id = b.id
       WHERE b.is_active = TRUE
       GROUP BY b.id
       ORDER BY b.branch_name`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/catalog/items', requireProductionOrAdmin, async (req, res, next) => {
  try {
    await ensureStockTables();
    const search = String(req.query.search || '').trim();
    const filters = ['is_active = TRUE'];
    const params = {};
    if (search) {
      filters.push('(item_name LIKE :search OR item_code LIKE :search)');
      params.search = `%${search}%`;
    }
    const rows = await query(
      `SELECT *
       FROM stock_catalog_items
       WHERE ${filters.join(' AND ')}
       ORDER BY item_name, item_code
       LIMIT 100`,
      params
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/bill-items', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    await ensureStockTables();
    const search = String(req.query.search || '').trim();
    if (!search) return res.json([]);
    const rows = await query(
      `SELECT i.id,
              i.item_name,
              i.item_code,
              i.quantity,
              COALESCE(NULLIF(i.unit_price, 0), c.unit_price, 0) AS unit_price,
              i.branch_id,
              b.branch_name,
              b.short_code AS branch_code
       FROM stock_items i
       JOIN stock_branches b ON b.id = i.branch_id
       LEFT JOIN stock_catalog_items c ON LOWER(c.item_code) = LOWER(i.item_code) AND c.is_active = TRUE
       WHERE i.is_active = TRUE
         AND b.is_active = TRUE
         AND (i.item_name LIKE :search OR i.item_code LIKE :search)
       ORDER BY i.item_name, b.branch_name
       LIMIT 20`,
      { search: `%${search}%` }
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/wholesale-bills', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    await ensureStockTables();
    const rows = await query(
      `SELECT wb.id,
              wb.bill_number,
              wb.customer_name,
              wb.note,
              wb.total_amount,
              wb.generated_at,
              e.name AS generated_by_name,
              r.name AS generated_by_role,
              COUNT(wbi.id) AS item_count
       FROM stock_wholesale_bills wb
       JOIN employees e ON e.id = wb.generated_by
       JOIN roles r ON r.id = e.role_id
       LEFT JOIN stock_wholesale_bill_items wbi ON wbi.bill_id = wb.id
       GROUP BY wb.id
       ORDER BY wb.generated_at DESC, wb.id DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/wholesale-bills', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    await ensureStockTables();
    const body = wholesaleBillSchema.parse({
      ...req.body,
      items: (req.body.items || []).map((item) => ({
        ...item,
        stock_item_id: item.stock_item_id ? Number(item.stock_item_id) : null,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price)
      }))
    });
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countRows = await query('SELECT COUNT(*) AS count FROM stock_wholesale_bills WHERE DATE(generated_at) = CURRENT_DATE');
    const billNumber = `WS-${today}-${String(Number(countRows[0]?.count || 0) + 1).padStart(3, '0')}`;
    const totalAmount = body.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0);
    const result = await query(
      `INSERT INTO stock_wholesale_bills (bill_number, customer_name, note, total_amount, generated_by)
       VALUES (:bill_number, :customer_name, :note, :total_amount, :generated_by)`,
      {
        bill_number: billNumber,
        customer_name: body.customer_name || null,
        note: body.note || null,
        total_amount: totalAmount,
        generated_by: req.user.id
      }
    );
    await Promise.all(body.items.map((item) => query(
      `INSERT INTO stock_wholesale_bill_items (
         bill_id, stock_item_id, item_name, item_code, branch_name, branch_code,
         quantity, unit_price, line_total
       )
       VALUES (
         :bill_id, :stock_item_id, :item_name, :item_code, :branch_name, :branch_code,
         :quantity, :unit_price, :line_total
       )`,
      {
        bill_id: result.insertId,
        stock_item_id: item.stock_item_id || null,
        item_name: item.item_name,
        item_code: item.item_code || null,
        branch_name: item.branch_name || null,
        branch_code: item.branch_code || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: Number(item.quantity) * Number(item.unit_price)
      }
    )));
    const bill = await getWholesaleBill(result.insertId);
    res.status(201).json({ ...bill, message: 'Wholesale stock bill generated successfully.' });
  } catch (error) {
    next(error);
  }
});

router.get('/wholesale-bills/:id/pdf', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    const bill = await getWholesaleBill(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Wholesale stock bill not found.' });
    sendWholesaleBillPdf(res, bill);
  } catch (error) {
    next(error);
  }
});

router.post('/bills', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    await ensureStockTables();
    const body = stockBillSchema.parse({
      ...req.body,
      stock_item_id: Number(req.body.stock_item_id),
      amount: Number(req.body.amount)
    });
    const itemRows = await query(
      `SELECT i.*, b.branch_name, b.short_code AS branch_code
       FROM stock_items i
       JOIN stock_branches b ON b.id = i.branch_id
       WHERE i.id = :id AND i.is_active = TRUE AND b.is_active = TRUE
       LIMIT 1`,
      { id: body.stock_item_id }
    );
    if (!itemRows.length) return res.status(404).json({ message: 'Stock item not found.' });

    const item = itemRows[0];
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countRows = await query('SELECT COUNT(*) AS count FROM stock_bills WHERE DATE(generated_at) = CURRENT_DATE');
    const billNumber = `STK-${today}-${String(Number(countRows[0]?.count || 0) + 1).padStart(3, '0')}`;
    const result = await query(
      `INSERT INTO stock_bills (
         bill_number, stock_item_id, branch_id, item_name, item_code, branch_name,
         branch_code, quantity_at_bill, amount, customer_name, note, generated_by
       )
       VALUES (
         :bill_number, :stock_item_id, :branch_id, :item_name, :item_code, :branch_name,
         :branch_code, :quantity_at_bill, :amount, :customer_name, :note, :generated_by
       )`,
      {
        bill_number: billNumber,
        stock_item_id: item.id,
        branch_id: item.branch_id,
        item_name: item.item_name,
        item_code: item.item_code,
        branch_name: item.branch_name,
        branch_code: item.branch_code,
        quantity_at_bill: item.quantity,
        amount: body.amount,
        customer_name: body.customer_name || null,
        note: body.note || null,
        generated_by: req.user.id
      }
    );
    const bill = await getStockBill(result.insertId);
    res.status(201).json({ ...bill, message: 'Stock bill generated successfully.' });
  } catch (error) {
    next(error);
  }
});

router.get('/bills/:id/pdf', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    const bill = await getStockBill(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Stock bill not found.' });
    sendStockBillPdf(res, bill);
  } catch (error) {
    next(error);
  }
});

router.post('/catalog/items', requireOwner, async (req, res, next) => {
  try {
    await ensureStockTables();
    const body = catalogItemSchema.parse(req.body);
    const existing = await query(
      'SELECT * FROM stock_catalog_items WHERE LOWER(item_code) = LOWER(:item_code) LIMIT 1',
      { item_code: body.item_code }
    );
    if (existing.length && existing[0].is_active) {
      return res.status(409).json({ message: 'Item code already exists.' });
    }
    if (existing.length) {
      await query(
        `UPDATE stock_catalog_items
         SET item_name = :item_name,
             item_code = :item_code,
             unit_price = :unit_price,
             is_active = TRUE,
             updated_by = :user_id
         WHERE id = :id`,
        { id: existing[0].id, item_name: body.item_name, item_code: body.item_code.toUpperCase(), unit_price: Number(body.unit_price || 0), user_id: req.user.id }
      );
      await query(
        `UPDATE stock_items
         SET item_name = :item_name,
             unit_price = :unit_price,
             updated_by = :user_id
         WHERE LOWER(item_code) = LOWER(:item_code)
           AND (unit_price = 0 OR unit_price IS NULL)`,
        { item_name: body.item_name, item_code: body.item_code, unit_price: Number(body.unit_price || 0), user_id: req.user.id }
      );
      const rows = await query('SELECT * FROM stock_catalog_items WHERE id = :id', { id: existing[0].id });
      return res.status(201).json({ ...rows[0], message: 'Item added successfully.' });
    }
    const result = await query(
      `INSERT INTO stock_catalog_items (item_name, item_code, unit_price, created_by, updated_by)
       VALUES (:item_name, :item_code, :unit_price, :user_id, :user_id)`,
      { item_name: body.item_name, item_code: body.item_code.toUpperCase(), unit_price: Number(body.unit_price || 0), user_id: req.user.id }
    );
    await query(
      `UPDATE stock_items
       SET item_name = :item_name,
           unit_price = :unit_price,
           updated_by = :user_id
       WHERE LOWER(item_code) = LOWER(:item_code)
         AND (unit_price = 0 OR unit_price IS NULL)`,
      { item_name: body.item_name, item_code: body.item_code, unit_price: Number(body.unit_price || 0), user_id: req.user.id }
    );
    const rows = await query('SELECT * FROM stock_catalog_items WHERE id = :id', { id: result.insertId });
    res.status(201).json({ ...rows[0], message: 'Item added successfully.' });
  } catch (error) {
    next(error);
  }
});

router.put('/catalog/items/:id', requireOwner, async (req, res, next) => {
  try {
    await ensureStockTables();
    const body = catalogItemSchema.partial().parse(req.body);
    const keys = Object.keys(body);
    if (!keys.length) return res.status(400).json({ message: 'No fields supplied.' });
    const payload = {
      id: req.params.id,
      item_name: body.item_name || null,
      item_code: body.item_code ? body.item_code.toUpperCase() : null,
      unit_price: body.unit_price ?? null,
      user_id: req.user.id
    };
    await query(
      `UPDATE stock_catalog_items
       SET item_name = COALESCE(:item_name, item_name),
           item_code = COALESCE(:item_code, item_code),
           unit_price = COALESCE(:unit_price, unit_price),
           updated_by = :user_id
       WHERE id = :id`,
      payload
    );
    const rows = await query('SELECT * FROM stock_catalog_items WHERE id = :id', { id: req.params.id });
    if (rows.length && body.unit_price !== undefined) {
      await query(
        `UPDATE stock_items
         SET unit_price = :unit_price,
             item_name = :item_name,
             updated_by = :user_id
         WHERE LOWER(item_code) = LOWER(:item_code)
           AND (unit_price = 0 OR unit_price IS NULL)`,
        {
          item_name: rows[0].item_name,
          item_code: rows[0].item_code,
          unit_price: Number(rows[0].unit_price || 0),
          user_id: req.user.id
        }
      );
    }
    res.json({ ...rows[0], message: 'Item updated successfully.' });
  } catch (error) {
    next(error);
  }
});

router.delete('/catalog/items/:id', requireOwner, async (req, res, next) => {
  try {
    await ensureStockTables();
    await query('UPDATE stock_catalog_items SET is_active = FALSE, updated_by = :user_id WHERE id = :id', {
      id: req.params.id,
      user_id: req.user.id
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/branches/:id/movements', requireProductionOrAdmin, async (req, res, next) => {
  try {
    await ensureStockTables();
    const rows = await query(
      `SELECT m.*, e.name AS changed_by_name, r.name AS changed_by_role
       FROM stock_movements m
       JOIN employees e ON e.id = m.changed_by
       JOIN roles r ON r.id = e.role_id
       WHERE m.branch_id = :id
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 50`,
      { id: req.params.id }
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/branches/:id/items', requireProductionOrAdmin, async (req, res, next) => {
  try {
    await ensureStockTables();
    const rows = await query(
      `SELECT i.id,
              i.branch_id,
              i.item_name,
              i.item_code,
              i.quantity,
              COALESCE(NULLIF(i.unit_price, 0), c.unit_price, 0) AS unit_price,
              i.is_active,
              i.created_by,
              i.updated_by,
              i.created_at,
              i.updated_at,
              b.branch_name,
              b.short_code,
              creator.name AS created_by_name,
              updater.name AS updated_by_name
       FROM stock_items i
       JOIN stock_branches b ON b.id = i.branch_id
       LEFT JOIN stock_catalog_items c ON LOWER(c.item_code) = LOWER(i.item_code) AND c.is_active = TRUE
       LEFT JOIN employees creator ON creator.id = i.created_by
       LEFT JOIN employees updater ON updater.id = i.updated_by
       WHERE i.branch_id = :branch_id AND i.is_active = TRUE AND b.is_active = TRUE
       ORDER BY i.item_name`,
      { branch_id: req.params.id }
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/items/:id/movements', requireProductionOrAdmin, async (req, res, next) => {
  try {
    await ensureStockTables();
    const rows = await query(
      `SELECT m.*, i.item_name, i.item_code, b.branch_name, e.name AS changed_by_name, r.name AS changed_by_role
       FROM stock_movements m
       LEFT JOIN stock_items i ON i.id = m.item_id
       JOIN stock_branches b ON b.id = m.branch_id
       JOIN employees e ON e.id = m.changed_by
       JOIN roles r ON r.id = e.role_id
       WHERE m.item_id = :id
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 50`,
      { id: req.params.id }
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/reports/full/excel', requireProductionOrAdmin, async (req, res, next) => {
  try {
    await sendStockExcel(res, await stockReportRows(), 'full-stock-report');
  } catch (error) {
    next(error);
  }
});

router.get('/reports/full/pdf', requireProductionOrAdmin, async (req, res, next) => {
  try {
    const rows = await stockReportRows();
    sendStockPdf(res, { rows, title: 'Full Stock Report', filename: 'full-stock-report' });
  } catch (error) {
    next(error);
  }
});

router.get('/reports/branches/:id/excel', requireProductionOrAdmin, async (req, res, next) => {
  try {
    const rows = await stockReportRows(req.params.id);
    const branchName = rows[0]?.branch_name || 'branch-stock-report';
    await sendStockExcel(res, rows, `${branchName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-stock-report`);
  } catch (error) {
    next(error);
  }
});

router.get('/reports/branches/:id/pdf', requireProductionOrAdmin, async (req, res, next) => {
  try {
    const rows = await stockReportRows(req.params.id);
    const branchName = rows[0]?.branch_name || 'Branch';
    sendStockPdf(res, {
      rows,
      title: 'Branch Stock Report',
      filename: `${branchName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-stock-report`,
      branchName
    });
  } catch (error) {
    next(error);
  }
});

router.post('/branches', requireOwner, async (req, res, next) => {
  try {
    await ensureStockTables();
    const body = branchSchema.parse(req.body);
    const result = await query(
      `INSERT INTO stock_branches (branch_name, short_code, quantity, created_by, updated_by)
       VALUES (:branch_name, :short_code, :quantity, :user_id, :user_id)`,
      {
        branch_name: body.branch_name,
        short_code: body.short_code.toUpperCase(),
        quantity: body.quantity || 0,
        user_id: req.user.id
      }
    );
    await query(
      `INSERT INTO stock_movements (branch_id, movement_type, quantity_change, previous_quantity, new_quantity, note, changed_by)
       VALUES (:branch_id, 'CREATE', :quantity, 0, :quantity, :note, :user_id)`,
      {
        branch_id: result.insertId,
        quantity: body.quantity || 0,
        note: 'Branch created',
        user_id: req.user.id
      }
    );
    const rows = await query('SELECT * FROM stock_branches WHERE id = :id', { id: result.insertId });
    res.status(201).json({ ...rows[0], message: 'Branch added successfully.' });
  } catch (error) {
    next(error);
  }
});

router.post('/branches/:id/items', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    await ensureStockTables();
    const branchRows = await query('SELECT * FROM stock_branches WHERE id = :id AND is_active = TRUE', { id: req.params.id });
    if (!branchRows.length) return res.status(404).json({ message: 'Branch not found.' });

    const body = itemSchema.parse(req.body);
    const quantity = body.quantity || 0;
    const existingBranchItem = await query(
      `SELECT id
       FROM stock_items
       WHERE branch_id = :branch_id
         AND LOWER(item_code) = LOWER(:item_code)
         AND is_active = TRUE
       LIMIT 1`,
      { branch_id: req.params.id, item_code: body.item_code }
    );
    if (existingBranchItem.length) {
      return res.status(409).json({ message: 'This item code already exists in this branch. Use + to add quantity.' });
    }
    await query(
      `INSERT INTO stock_catalog_items (item_name, item_code, unit_price, created_by, updated_by)
       VALUES (:item_name, :item_code, :unit_price, :user_id, :user_id)
       ON DUPLICATE KEY UPDATE item_name = VALUES(item_name), unit_price = VALUES(unit_price), is_active = TRUE, updated_by = VALUES(updated_by)`,
      { item_name: body.item_name, item_code: body.item_code.toUpperCase(), unit_price: Number(body.unit_price || 0), user_id: req.user.id }
    );
    const result = await query(
      `INSERT INTO stock_items (branch_id, item_name, item_code, quantity, unit_price, created_by, updated_by)
       VALUES (:branch_id, :item_name, :item_code, :quantity, :unit_price, :user_id, :user_id)`,
      {
        branch_id: req.params.id,
        item_name: body.item_name,
        item_code: body.item_code.toUpperCase(),
        quantity,
        unit_price: Number(body.unit_price || 0),
        user_id: req.user.id
      }
    );
    await query(
      `INSERT INTO stock_movements (branch_id, item_id, movement_type, quantity_change, previous_quantity, new_quantity, note, changed_by)
       VALUES (:branch_id, :item_id, 'CREATE', :quantity, 0, :quantity, :note, :user_id)`,
      {
        branch_id: req.params.id,
        item_id: result.insertId,
        quantity,
        note: 'Item created',
        user_id: req.user.id
      }
    );
    const rows = await query('SELECT * FROM stock_items WHERE id = :id', { id: result.insertId });
    res.status(201).json({ ...rows[0], message: 'Item added successfully.' });
  } catch (error) {
    next(error);
  }
});

router.put('/items/:id', requireOwner, async (req, res, next) => {
  try {
    await ensureStockTables();
    const body = itemSchema.partial().parse(req.body);
    const rows = await query('SELECT * FROM stock_items WHERE id = :id AND is_active = TRUE', { id: req.params.id });
    if (!rows.length) return res.status(404).json({ message: 'Item not found.' });

    const nextQuantity = body.quantity ?? rows[0].quantity;
    await query(
      `UPDATE stock_items
       SET item_name = COALESCE(:item_name, item_name),
           item_code = COALESCE(:item_code, item_code),
           quantity = :quantity,
           unit_price = COALESCE(:unit_price, unit_price),
           updated_by = :user_id
       WHERE id = :id`,
      {
        id: req.params.id,
        item_name: body.item_name || null,
        item_code: body.item_code ? body.item_code.toUpperCase() : null,
        quantity: nextQuantity,
        unit_price: body.unit_price ?? null,
        user_id: req.user.id
      }
    );
    await query(
      `INSERT INTO stock_movements (branch_id, item_id, movement_type, quantity_change, previous_quantity, new_quantity, note, changed_by)
       VALUES (:branch_id, :item_id, 'EDIT', :change, :previous, :next, :note, :user_id)`,
      {
        branch_id: rows[0].branch_id,
        item_id: req.params.id,
        change: Number(nextQuantity) - Number(rows[0].quantity),
        previous: rows[0].quantity,
        next: nextQuantity,
        note: 'Item edited',
        user_id: req.user.id
      }
    );
    const updated = await query('SELECT * FROM stock_items WHERE id = :id', { id: req.params.id });
    res.json({ ...updated[0], message: 'Item updated successfully.' });
  } catch (error) {
    next(error);
  }
});

router.patch('/items/:id/quantity', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    await ensureStockTables();
    const body = quantitySchema.parse(req.body);
    const rows = await query('SELECT * FROM stock_items WHERE id = :id AND is_active = TRUE', { id: req.params.id });
    if (!rows.length) return res.status(404).json({ message: 'Item not found.' });

    const previousQuantity = Number(rows[0].quantity || 0);
    const change = body.type === 'ADD' ? body.quantity : -body.quantity;
    const nextQuantity = previousQuantity + change;
    if (nextQuantity < 0) {
      return res.status(400).json({ message: 'Item quantity cannot be reduced below zero.' });
    }

    await query(
      'UPDATE stock_items SET quantity = :quantity, updated_by = :user_id WHERE id = :id',
      { id: req.params.id, quantity: nextQuantity, user_id: req.user.id }
    );
    await query(
      `INSERT INTO stock_movements (branch_id, item_id, movement_type, quantity_change, previous_quantity, new_quantity, note, changed_by)
       VALUES (:branch_id, :item_id, :movement_type, :quantity_change, :previous_quantity, :new_quantity, :note, :changed_by)`,
      {
        branch_id: rows[0].branch_id,
        item_id: req.params.id,
        movement_type: body.type,
        quantity_change: change,
        previous_quantity: previousQuantity,
        new_quantity: nextQuantity,
        note: body.note || null,
        changed_by: req.user.id
      }
    );
    const updated = await query('SELECT * FROM stock_items WHERE id = :id', { id: req.params.id });
    res.json({ ...updated[0], message: body.type === 'ADD' ? 'Item stock added successfully.' : 'Item stock reduced successfully.' });
  } catch (error) {
    next(error);
  }
});

router.delete('/items/:id', requireOwner, async (req, res, next) => {
  try {
    await ensureStockTables();
    const rows = await query('SELECT * FROM stock_items WHERE id = :id AND is_active = TRUE', { id: req.params.id });
    if (!rows.length) return res.status(404).json({ message: 'Item not found.' });
    await query('UPDATE stock_items SET is_active = FALSE, updated_by = :user_id WHERE id = :id', { id: req.params.id, user_id: req.user.id });
    await query(
      `INSERT INTO stock_movements (branch_id, item_id, movement_type, quantity_change, previous_quantity, new_quantity, note, changed_by)
       VALUES (:branch_id, :item_id, 'DELETE', 0, :quantity, :quantity, :note, :user_id)`,
      {
        branch_id: rows[0].branch_id,
        item_id: req.params.id,
        quantity: rows[0].quantity,
        note: 'Item deactivated',
        user_id: req.user.id
      }
    );
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.put('/branches/:id', requireOwner, async (req, res, next) => {
  try {
    await ensureStockTables();
    const body = branchSchema.partial().parse(req.body);
    const rows = await query('SELECT * FROM stock_branches WHERE id = :id AND is_active = TRUE', { id: req.params.id });
    if (!rows.length) return res.status(404).json({ message: 'Branch not found.' });

    const nextQuantity = body.quantity ?? rows[0].quantity;
    await query(
      `UPDATE stock_branches
       SET branch_name = COALESCE(:branch_name, branch_name),
           short_code = COALESCE(:short_code, short_code),
           quantity = :quantity,
           updated_by = :user_id
       WHERE id = :id`,
      {
        id: req.params.id,
        branch_name: body.branch_name || null,
        short_code: body.short_code ? body.short_code.toUpperCase() : null,
        quantity: nextQuantity,
        user_id: req.user.id
      }
    );
    await query(
      `INSERT INTO stock_movements (branch_id, movement_type, quantity_change, previous_quantity, new_quantity, note, changed_by)
       VALUES (:branch_id, 'EDIT', :change, :previous, :next, :note, :user_id)`,
      {
        branch_id: req.params.id,
        change: Number(nextQuantity) - Number(rows[0].quantity),
        previous: rows[0].quantity,
        next: nextQuantity,
        note: 'Branch edited',
        user_id: req.user.id
      }
    );
    const updated = await query('SELECT * FROM stock_branches WHERE id = :id', { id: req.params.id });
    res.json({ ...updated[0], message: 'Branch updated successfully.' });
  } catch (error) {
    next(error);
  }
});

router.patch('/branches/:id/quantity', requireAdminOrCoAdmin, async (req, res, next) => {
  try {
    await ensureStockTables();
    return res.status(400).json({ message: 'Branch quantity is calculated from item quantities. Please add or reduce stock from an item.' });
    const body = quantitySchema.parse(req.body);
    const rows = await query('SELECT * FROM stock_branches WHERE id = :id AND is_active = TRUE', { id: req.params.id });
    if (!rows.length) return res.status(404).json({ message: 'Branch not found.' });

    const previousQuantity = Number(rows[0].quantity || 0);
    const change = body.type === 'ADD' ? body.quantity : -body.quantity;
    const nextQuantity = previousQuantity + change;
    if (nextQuantity < 0) {
      return res.status(400).json({ message: 'Stock quantity cannot be reduced below zero.' });
    }

    await query(
      'UPDATE stock_branches SET quantity = :quantity, updated_by = :user_id WHERE id = :id',
      { id: req.params.id, quantity: nextQuantity, user_id: req.user.id }
    );
    await query(
      `INSERT INTO stock_movements (branch_id, movement_type, quantity_change, previous_quantity, new_quantity, note, changed_by)
       VALUES (:branch_id, :movement_type, :quantity_change, :previous_quantity, :new_quantity, :note, :changed_by)`,
      {
        branch_id: req.params.id,
        movement_type: body.type,
        quantity_change: change,
        previous_quantity: previousQuantity,
        new_quantity: nextQuantity,
        note: body.note || null,
        changed_by: req.user.id
      }
    );
    const updated = await query('SELECT * FROM stock_branches WHERE id = :id', { id: req.params.id });
    res.json({ ...updated[0], message: body.type === 'ADD' ? 'Stock added successfully.' : 'Stock reduced successfully.' });
  } catch (error) {
    next(error);
  }
});

router.delete('/branches/:id', requireOwner, async (req, res, next) => {
  try {
    await ensureStockTables();
    const rows = await query('SELECT * FROM stock_branches WHERE id = :id AND is_active = TRUE', { id: req.params.id });
    if (!rows.length) return res.status(404).json({ message: 'Branch not found.' });
    await query('UPDATE stock_branches SET is_active = FALSE, updated_by = :user_id WHERE id = :id', { id: req.params.id, user_id: req.user.id });
    await query(
      `INSERT INTO stock_movements (branch_id, movement_type, quantity_change, previous_quantity, new_quantity, note, changed_by)
       VALUES (:branch_id, 'DELETE', 0, :quantity, :quantity, :note, :user_id)`,
      { branch_id: req.params.id, quantity: rows[0].quantity, note: 'Branch deactivated', user_id: req.user.id }
    );
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
