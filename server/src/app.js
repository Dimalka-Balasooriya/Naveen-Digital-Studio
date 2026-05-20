import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import employeeRoutes from './routes/employees.routes.js';
import lookupRoutes from './routes/lookups.routes.js';
import orderRoutes from './routes/orders.routes.js';
import productionRoutes from './routes/production.routes.js';
import reminderRoutes from './routes/reminders.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import commissionsRoutes from './routes/commissions.routes.js';
import customersRoutes from './routes/customers.routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

dotenv.config();

const app = express();

app.use(helmet());

const allowedOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Naveen Digital Studio API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/lookups', lookupRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/commissions', commissionsRoutes);
app.use('/api/customers', customersRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
