import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { query } from '../config/db.js';

const router = Router();
router.use(authenticate);

let hasCheckedMessageTables = false;

async function ensureMessageTables() {
  if (hasCheckedMessageTables) return;
  await query(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sender_id INT NOT NULL,
      subject VARCHAR(180) NOT NULL,
      body TEXT NOT NULL,
      type ENUM('normal', 'warning') NOT NULL DEFAULT 'normal',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES employees(id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS message_recipients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      message_id INT NOT NULL,
      recipient_id INT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      read_at TIMESTAMP NULL,
      CONSTRAINT uq_message_recipient UNIQUE (message_id, recipient_id),
      CONSTRAINT fk_message_recipients_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      CONSTRAINT fk_message_recipients_recipient FOREIGN KEY (recipient_id) REFERENCES employees(id)
    )
  `);
  hasCheckedMessageTables = true;
}

const sendSchema = z.object({
  recipient_ids: z.array(z.number().int().positive()).min(1, 'Select at least one recipient.'),
  subject: z.string().min(2, 'Subject is required.').max(180),
  body: z.string().min(2, 'Message body is required.'),
  type: z.enum(['normal', 'warning']).default('normal')
});

function canSendWarning(role) {
  return ['OWNER', 'CO_ADMIN'].includes(role);
}

function recipientRoleFilter(userRole) {
  if (userRole === 'OWNER') return "r.name IN ('OWNER', 'CO_ADMIN', 'PRODUCTION_EMPLOYEE')";
  if (userRole === 'CO_ADMIN') return "r.name IN ('CO_ADMIN', 'PRODUCTION_EMPLOYEE')";
  return "r.name IN ('OWNER', 'CO_ADMIN')";
}

router.get('/recipients', async (req, res, next) => {
  try {
    await ensureMessageTables();
    const rows = await query(
      `SELECT e.id, e.name, e.email, r.name AS role
       FROM employees e
       JOIN roles r ON r.id = e.role_id
       WHERE e.is_active = TRUE
         AND e.id <> :current_user_id
         AND ${recipientRoleFilter(req.user.role)}
       ORDER BY FIELD(r.name, 'OWNER', 'CO_ADMIN', 'PRODUCTION_EMPLOYEE'), e.name`,
      { current_user_id: req.user.id }
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/unread-count', async (req, res, next) => {
  try {
    await ensureMessageTables();
    const rows = await query(
      `SELECT COUNT(*) AS unread_count
       FROM message_recipients
       WHERE recipient_id = :user_id AND is_read = FALSE`,
      { user_id: req.user.id }
    );
    res.json({ unread_count: Number(rows[0]?.unread_count || 0) });
  } catch (error) {
    next(error);
  }
});

router.get('/inbox', async (req, res, next) => {
  try {
    await ensureMessageTables();
    const rows = await query(
      `SELECT m.id, m.subject, m.body, m.type, m.created_at,
              mr.is_read, mr.read_at,
              sender.name AS sender_name, sender.email AS sender_email, sr.name AS sender_role
       FROM message_recipients mr
       JOIN messages m ON m.id = mr.message_id
       JOIN employees sender ON sender.id = m.sender_id
       JOIN roles sr ON sr.id = sender.role_id
       WHERE mr.recipient_id = :user_id
       ORDER BY m.created_at DESC, m.id DESC`,
      { user_id: req.user.id }
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/sent', async (req, res, next) => {
  try {
    await ensureMessageTables();
    const rows = await query(
      `SELECT m.id, m.subject, m.body, m.type, m.created_at,
              COUNT(mr.id) AS recipient_count,
              SUM(CASE WHEN mr.is_read = TRUE THEN 1 ELSE 0 END) AS read_count,
              GROUP_CONCAT(CONCAT(recipient.name, ' (', rr.name, ')') ORDER BY recipient.name SEPARATOR ', ') AS recipients
       FROM messages m
       JOIN message_recipients mr ON mr.message_id = m.id
       JOIN employees recipient ON recipient.id = mr.recipient_id
       JOIN roles rr ON rr.id = recipient.role_id
       WHERE m.sender_id = :user_id
       GROUP BY m.id
       ORDER BY m.created_at DESC, m.id DESC`,
      { user_id: req.user.id }
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/send', async (req, res, next) => {
  try {
    await ensureMessageTables();
    const body = sendSchema.parse(req.body);
    if (body.type === 'warning' && !canSendWarning(req.user.role)) {
      return res.status(403).json({ message: 'Production employees cannot send warning messages.' });
    }

    const recipientParams = Object.fromEntries(
      body.recipient_ids.map((id, index) => [`recipient_id_${index}`, id])
    );
    const recipientPlaceholders = body.recipient_ids.map((_, index) => `:recipient_id_${index}`).join(', ');
    const recipients = await query(
      `SELECT e.id
       FROM employees e
       JOIN roles r ON r.id = e.role_id
       WHERE e.is_active = TRUE
         AND e.id IN (${recipientPlaceholders})
         AND e.id <> :current_user_id
         AND ${recipientRoleFilter(req.user.role)}`,
      { ...recipientParams, current_user_id: req.user.id }
    );
    if (!recipients.length) {
      return res.status(400).json({ message: 'No allowed recipients selected.' });
    }

    const message = await query(
      `INSERT INTO messages (sender_id, subject, body, type)
       VALUES (:sender_id, :subject, :body, :type)`,
      { sender_id: req.user.id, subject: body.subject, body: body.body, type: body.type }
    );

    await Promise.all(recipients.map((recipient) => query(
      `INSERT IGNORE INTO message_recipients (message_id, recipient_id)
       VALUES (:message_id, :recipient_id)`,
      { message_id: message.insertId, recipient_id: recipient.id }
    )));

    res.status(201).json({ message: 'Message sent successfully.', id: message.insertId });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    await ensureMessageTables();
    const result = await query(
      `UPDATE message_recipients
       SET is_read = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
       WHERE message_id = :message_id AND recipient_id = :user_id`,
      { message_id: req.params.id, user_id: req.user.id }
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Message not found in your inbox.' });
    res.json({ message: 'Message marked as read.' });
  } catch (error) {
    next(error);
  }
});

export default router;
