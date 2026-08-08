import { Router } from 'express';
import {
  createPlant,
  getPlants,
  getPlant,
  updatePlant,
  deletePlant,
  uploadPlantImages,
} from '../controllers/plant.controller';
import { listReviews, upsertReview } from '../controllers/review.controller';
import { protect, optionalAuth } from '../middlewares/auth.middleware';
import { authorize } from '../middlewares/role.middleware';
import { upload } from '@src/middlewares/upload';

// Mounted at both /api/plants and /api/products.
const router = Router();

// public catalogue endpoints (optionalAuth marks admins so they can see
// archived products too)
router.get('/', optionalAuth, getPlants);
router.get('/:id', optionalAuth, getPlant);

// reviews
router.get('/:id/reviews', listReviews);
router.post('/:id/reviews', protect, upsertReview);

// admin protected
router.post('/', protect, authorize('admin'), upload.array('images', 6), createPlant);
router.post(
  '/:plantId/images',
  protect,
  authorize('admin'),
  upload.array('images', 5),
  uploadPlantImages,
);
router.put('/:id', protect, authorize('admin'), upload.array('images', 6), updatePlant);
router.delete('/:id', protect, authorize('admin'), deletePlant);

export default router;
