import { Router } from 'express';
import { deleteReview } from '@src/controllers/review.controller';
import { protect } from '@src/middlewares/auth.middleware';

const router = Router();

// Review creation/listing lives under /api/products/:id/reviews; only
// deletion is keyed by the review's own id.
router.delete('/:id', protect, deleteReview);

export default router;
