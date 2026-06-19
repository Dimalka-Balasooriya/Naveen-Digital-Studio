export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(error, req, res, next) {
  if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error?.code)) {
    console.error(`[db] Connection failed: ${error.code}`);
    return res.status(503).json({ message: 'Database connection failed. Check DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, and DB_SSL in Vercel.' });
  }

  if (error?.code === 'ER_DUP_ENTRY') {
    const detail = String(error.sqlMessage || '');
    if (detail.includes('customers.phone')) {
      return res.status(409).json({ message: 'This WhatsApp number already exists. The order should attach to the existing customer; please try again.' });
    }
    if (detail.includes('orders.order_number')) {
      return res.status(409).json({ message: 'Order number already exists. Please click Save again to generate the next number.' });
    }
    if (detail.includes('products.name')) {
      return res.status(409).json({ message: 'This product already exists. Select it from the product dropdown or try again.' });
    }
    if (detail.includes('employees.email')) {
      return res.status(409).json({ message: 'This employee email already exists.' });
    }
    return res.status(409).json({ message: 'Duplicate value detected. Check unique fields such as WhatsApp number, product name, email, or order number.' });
  }

  if (error?.name === 'ZodError') {
    const flattened = error.flatten();
    const firstField = Object.entries(flattened.fieldErrors || {}).find(([, messages]) => messages?.length);
    const firstMessage = firstField ? `${firstField[0]}: ${firstField[1][0]}` : flattened.formErrors?.[0];
    return res.status(400).json({ message: firstMessage || 'Validation failed.', errors: flattened });
  }

  console.error(error);
  res.status(error.status || 500).json({ message: error.message || 'Internal server error.' });
}
