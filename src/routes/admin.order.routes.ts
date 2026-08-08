import { Router } from 'express';
import {
  listOrders,
  getOrder,
  updateOrderStatus,
  deleteOrder,
} from '@src/controllers/admin.order.controller';
import { protect } from '@src/middlewares/auth.middleware';
import { authorize } from '@src/middlewares/role.middleware';

const router = Router();

router.get('/', protect, authorize('admin'), listOrders);
router.get('/:id', protect, authorize('admin'), getOrder);
router.put('/:id/status', protect, authorize('admin'), updateOrderStatus);
router.patch('/:id/status', protect, authorize('admin'), updateOrderStatus);
router.delete('/:id', protect, authorize('admin'), deleteOrder);

export default router;
