import morgan from 'morgan';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import express, { Request, Response, NextFunction } from 'express';
import logger from 'jet-logger';

import BaseRouter from '@src/routes';

import Paths from '@src/common/constants/PATHS';
import ENV from '@src/common/constants/ENV';
import HTTP_STATUS_CODES, {
  HttpStatusCodes,
} from '@src/common/constants/HTTP_STATUS_CODES';
import { RouteError } from '@src/common/util/route-errors';
import { NODE_ENVS } from '@src/common/constants';
import plantRoutes from './routes/plant.routes';
import authRoutes from './routes/auth.routes';
import categoryRoutes from './routes/category.routes';
import paymentRoutes from './routes/payment.routes';
import cartRoutes from './routes/cart.routes';
import orderRoutes from './routes/order.routes';
import adminOrderRoutes from './routes/admin.order.routes';


/******************************************************************************
                                Setup
******************************************************************************/

const app = express();


// **** Middleware **** //

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS - allow the configured frontend origins
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'idempotency-key', 'verify-hash'],
  credentials: true,
};

app.use(cors(corsOptions));

// Show routes called in console during development
if (ENV.NodeEnv === NODE_ENVS.Dev) {
  app.use(morgan('dev'));
}

// Security
if (ENV.NodeEnv === NODE_ENVS.Production) {
  // eslint-disable-next-line n/no-process-env
  if (!process.env.DISABLE_HELMET) {
    app.use(helmet());
  }
}

// **** API Routes **** //

app.use(Paths.Base, BaseRouter);

app.use('/api/plants', plantRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin/orders', adminOrderRoutes);

// Health check (liveness/readiness probe)
app.get(['/api/health', '/health'], (_: Request, res: Response) => {
  res.status(HTTP_STATUS_CODES.Ok).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});


// **** FrontEnd Content **** //

// Set views directory (html)
const viewsDir = path.join(__dirname, 'views');
app.set('views', viewsDir);

// Set static directory (js and css).
const staticDir = path.join(__dirname, 'public');
app.use(express.static(staticDir));

// Nav to users pg by default
app.get('/', (_: Request, res: Response) => {
  return res.redirect('/users');
});

// Redirect to login if not logged in.
app.get('/users', (_: Request, res: Response) => {
  return res.sendFile('users.html', { root: viewsDir });
});


// **** 404 handler for unmatched API routes **** //

app.use(Paths.Base, (req: Request, res: Response) => {
  res.status(HTTP_STATUS_CODES.NotFound).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});


// **** Error Handler (must be registered last) **** //

app.use((err: Error & { code?: number }, _: Request, res: Response, next: NextFunction) => {
  // If a response was already sent, delegate to the default Express handler.
  if (res.headersSent) {
    return next(err);
  }

  if (ENV.NodeEnv !== NODE_ENVS.Test.valueOf()) {
    logger.err(err, true);
  }

  let status: HttpStatusCodes = HTTP_STATUS_CODES.InternalServerError;
  let message = 'Internal server error';

  if (err instanceof RouteError) {
    status = err.status;
    message = err.message;
  } else if (err.name === 'ValidationError') {
    // Mongoose schema validation failed
    status = HTTP_STATUS_CODES.BadRequest;
    message = err.message;
  } else if (err.name === 'CastError') {
    // Invalid ObjectId (or other cast) in query/path params
    status = HTTP_STATUS_CODES.BadRequest;
    message = 'Invalid identifier in request';
  } else if (err.code === 11000) {
    // Mongo duplicate key
    status = HTTP_STATUS_CODES.Conflict;
    message = 'A record with the same unique value already exists';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    status = HTTP_STATUS_CODES.Unauthorized;
    message = 'Token invalid or expired';
  }

  return res.status(status).json({ error: message });
});


/******************************************************************************
                                Export default
******************************************************************************/

export default app;
