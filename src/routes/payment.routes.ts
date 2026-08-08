import { Router } from 'express';
import { idempotency } from '@src/middlewares/idempotency.middleware';
import { flutterwaveWebhook } from '@src/controllers/webhook.controller';
import { initializePayment } from '@src/controllers/payment.controller';
import { protect } from '@src/middlewares/auth.middleware';

const router = Router();
router.post('/initialize', protect, initializePayment);
router.post('/webhook/flutterwave', idempotency, flutterwaveWebhook);
export default router;
