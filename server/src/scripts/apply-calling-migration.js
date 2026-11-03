import { pathToFileURL } from 'node:url';

export async function migrateCalling(connection) {
  await connection.execute("INSERT IGNORE INTO roles (name) VALUES ('CALLING_AGENT')");
  await connection.execute(`CREATE TABLE IF NOT EXISTS order_calling_state (
    order_id INT PRIMARY KEY,
    calling_status ENUM('Not Called','No Answer','Call Back','Confirmed','Wrong Number','Completed') NOT NULL DEFAULT 'Not Called',
    version INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_calling_state_order FOREIGN KEY (order_id) REFERENCES orders(id),
    INDEX idx_calling_status (calling_status, order_id)
  ) ENGINE=InnoDB`);
  await connection.execute(`CREATE TABLE IF NOT EXISTS order_calling_requests (
    request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    order_id INT NOT NULL,
    agent_id INT NOT NULL,
    payload_hash CHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_calling_request_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_calling_request_agent FOREIGN KEY (agent_id) REFERENCES employees(id)
  ) ENGINE=InnoDB`);
  await connection.execute(`CREATE TABLE IF NOT EXISTS order_calling_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    previous_status VARCHAR(30) NOT NULL,
    new_status VARCHAR(30) NOT NULL,
    agent_id INT NOT NULL,
    request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    notes TEXT NULL,
    changed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_calling_history_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_calling_history_agent FOREIGN KEY (agent_id) REFERENCES employees(id),
    CONSTRAINT fk_calling_history_request FOREIGN KEY (request_id) REFERENCES order_calling_requests(request_id),
    INDEX idx_calling_history_order (order_id, changed_at, id)
  ) ENGINE=InnoDB`);
  const [indexes] = await connection.execute(`SELECT INDEX_NAME FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_status_history' AND INDEX_NAME='idx_calling_eligible_history'`);
  if (!indexes.length) {
    try { await connection.execute('CREATE INDEX idx_calling_eligible_history ON order_status_history (order_id, to_status_id, changed_at)'); }
    catch (error) { if (error.code !== 'ER_DUP_KEYNAME') throw error; }
  }
  // No order backfill: absent state reads as Not Called/version 0.
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { pool } = await import('../config/db.js');
  try {
    const connection = await pool.getConnection();
    try { await migrateCalling(connection); console.log('Calling module migration complete. Existing orders preserved.'); }
    finally { connection.release(); }
  } finally { await pool.end(); }
}
