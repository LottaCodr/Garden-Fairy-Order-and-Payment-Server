import { Router } from 'express';
import { submitContact } from '@src/controllers/contact.controller';
import { limitContact } from '@src/middlewares/rateLimit.middleware';

const router = Router();

router.post('/', limitContact, submitContact);

export default router;
