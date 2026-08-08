import { Router } from 'express';
import { listOrders, updateOrderStatus } from '@src/controllers/admin.order.controller';
import { protect } from '@src/middlewares/auth.middleware';
import { authorize } from '@src/middlewares/role.middleware';

const router = Router();

router.get('/', protect, authorize('admin'), listOrders);
router.put('/:id/status', protect, authorize('admin'), updateOrderStatus);

export default router;
