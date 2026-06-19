CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender_id INT NOT NULL,
  subject VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  type ENUM('normal', 'warning') NOT NULL DEFAULT 'normal',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS message_recipients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  recipient_id INT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMP NULL,
  CONSTRAINT uq_message_recipient UNIQUE (message_id, recipient_id),
  CONSTRAINT fk_message_recipients_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_recipients_recipient FOREIGN KEY (recipient_id) REFERENCES employees(id)
);
