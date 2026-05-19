export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(error, req, res, next) {
  if (error?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'Duplicate value detected. Check unique fields such as phone or email.' });
  }

  if (error?.name === 'ZodError') {
    return res.status(400).json({ message: 'Validation failed.', errors: error.flatten() });
  }

  console.error(error);
  res.status(error.status || 500).json({ message: error.message || 'Internal server error.' });
}
