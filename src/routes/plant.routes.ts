import { Router } from 'express';
import {
  createPlant,
  getPlants,
  getPlant,
  updatePlant,
  deletePlant,
  uploadPlantImages,
} from '../controllers/plant.controller';
import { protect } from '../middlewares/auth.middleware';
import { authorize } from '../middlewares/role.middleware';
import { upload } from '@src/middlewares/upload';

const router = Router();

// public catalogue endpoints
router.get('/', getPlants);
router.get('/:id', getPlant);

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
