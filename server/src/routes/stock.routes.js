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
  quantity: z.number().int().min(0, 'Quantity must be zero or more.').optional()
});

const itemSchema = z.object({
  item_name: z.string().min(2, 'Item name is required.'),
  item_code: z.string().min(2, 'Item code is required.'),
  quantity: z.number().int().min(0, 'Quantity must be zero or more.').optional()
});

const catalogItemSchema = z.object({
  item_name: z.string().min(2, 'Item name is required.'),
  item_code: z.string().min(2, 'Item code is required.')
});

const quantitySchema = z.object({
  type: z.enum(['ADD', 'REDUCE']),
  quantity: z.number().int().positive('Quantity must be greater than 0.'),
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
            updater.name AS last_updated_by,
            i.updated_at
     FROM stock_branches b
     LEFT JOIN stock_items i ON i.branch_id = b.id AND i.is_active = TRUE
     LEFT JOIN employees updater ON updater.id = i.updated_by
     WHERE b.is_active = TRUE
     ${branchFilter}
     ORDER BY b.branch_name, i.item_name`,
    branchId ? { branch_id: branchId } : {}
  );
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
    { header: 'LAST UPDATED BY', key: 'last_updated_by', width: 24 },
    { header: 'UPDATED AT', key: 'updated_at', width: 24 }
  ];
  rows.forEach((row) => sheet.addRow({
    ...row,
    item_name: row.item_name || '-',
    item_code: row.item_code || '-',
    quantity: Number(row.quantity || 0),
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
    { label: 'Item', width: 148, value: (row) => row.item_name || '-' },
    { label: 'Item Code', width: 82, value: (row) => row.item_code || '-' },
    { label: 'Qty', width: 46, value: (row) => Number(row.quantity || 0) },
    { label: 'Updated', width: 77, value: (row) => fmtDate(row.updated_at) }
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
         SET item_name = :item_name, item_code = :item_code, is_active = TRUE, updated_by = :user_id
         WHERE id = :id`,
        { id: existing[0].id, item_name: body.item_name, item_code: body.item_code.toUpperCase(), user_id: req.user.id }
      );
      const rows = await query('SELECT * FROM stock_catalog_items WHERE id = :id', { id: existing[0].id });
      return res.status(201).json({ ...rows[0], message: 'Item added successfully.' });
    }
    const result = await query(
      `INSERT INTO stock_catalog_items (item_name, item_code, created_by, updated_by)
       VALUES (:item_name, :item_code, :user_id, :user_id)`,
      { item_name: body.item_name, item_code: body.item_code.toUpperCase(), user_id: req.user.id }
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
      user_id: req.user.id
    };
    await query(
      `UPDATE stock_catalog_items
       SET item_name = COALESCE(:item_name, item_name),
           item_code = COALESCE(:item_code, item_code),
           updated_by = :user_id
       WHERE id = :id`,
      payload
    );
    const rows = await query('SELECT * FROM stock_catalog_items WHERE id = :id', { id: req.params.id });
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
      `SELECT i.*, b.branch_name, b.short_code, creator.name AS created_by_name, updater.name AS updated_by_name
       FROM stock_items i
       JOIN stock_branches b ON b.id = i.branch_id
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
      `INSERT INTO stock_catalog_items (item_name, item_code, created_by, updated_by)
       VALUES (:item_name, :item_code, :user_id, :user_id)
       ON DUPLICATE KEY UPDATE item_name = VALUES(item_name), is_active = TRUE, updated_by = VALUES(updated_by)`,
      { item_name: body.item_name, item_code: body.item_code.toUpperCase(), user_id: req.user.id }
    );
    const result = await query(
      `INSERT INTO stock_items (branch_id, item_name, item_code, quantity, created_by, updated_by)
       VALUES (:branch_id, :item_name, :item_code, :quantity, :user_id, :user_id)`,
      {
        branch_id: req.params.id,
        item_name: body.item_name,
        item_code: body.item_code.toUpperCase(),
        quantity,
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
           updated_by = :user_id
       WHERE id = :id`,
      {
        id: req.params.id,
        item_name: body.item_name || null,
        item_code: body.item_code ? body.item_code.toUpperCase() : null,
        quantity: nextQuantity,
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
