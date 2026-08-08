import { Router } from 'express';
import {
  estimateDelivery,
  checkout,
} from '@src/controllers/checkout.controller';
import { optionalAuth } from '@src/middlewares/auth.middleware';
import { ensureSession } from '@src/middlewares/session.middleware';
import { limitCheckout } from '@src/middlewares/rateLimit.middleware';
import { idempotency } from '@src/middlewares/idempotency.middleware';

const router = Router();

// Estimate is a pure lookup — public, no session needed.
router.post('/estimate', estimateDelivery);

// Checkout works for guests and registered users alike.
router.post(
  '/',
  limitCheckout,
  optionalAuth,
  ensureSession,
  idempotency,
  checkout,
);

export default router;
