import { Router } from 'express';
import { subscribe, unsubscribe } from '@src/controllers/newsletter.controller';
import { limitNewsletter } from '@src/middlewares/rateLimit.middleware';

const router = Router();

router.post('/subscribe', limitNewsletter, subscribe);
router.post('/unsubscribe', limitNewsletter, unsubscribe);

export default router;
