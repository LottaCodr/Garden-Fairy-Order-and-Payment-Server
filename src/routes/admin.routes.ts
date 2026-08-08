import { Router } from 'express';

import {
  createPlant,
  updatePlant,
  deletePlant,
  uploadImage,
  getPlants,
} from '@src/controllers/plant.controller';
import {
  getDashboard,
  getAnalytics,
  getCustomers,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@src/controllers/admin.dashboard.controller';
import {
  getAdminSettings,
  putAdminSettings,
} from '@src/controllers/settings.controller';
import {
  listContactMessages,
  updateContactMessage,
} from '@src/controllers/contact.controller';
import { protect } from '@src/middlewares/auth.middleware';
import { authorize } from '@src/middlewares/role.middleware';
import { upload } from '@src/middlewares/upload';

// Aggregate admin router — mounted at /api/admin. Every handler is
// auth-gated and admin-only.
const router = Router();

router.use(protect, authorize('admin'));

// Catalog CRUD aliases (spec surface — same handlers as /api/plants admin ops)
router.get('/products', getPlants);
router.post('/products', upload.array('images', 6), createPlant);
router.put('/products/:id', upload.array('images', 6), updatePlant);
router.delete('/products/:id', deletePlant);

// Standalone image upload → CDN URL for the product form
router.post('/uploads', upload.array('images', 5), uploadImage);
router.post('/uploads/single', upload.single('image'), uploadImage);

// Store settings
router.get('/settings', getAdminSettings);
router.put('/settings', putAdminSettings);

// Dashboard / analytics / customers
router.get('/dashboard', getDashboard);
router.get('/analytics', getAnalytics);
router.get('/customers', getCustomers);

// Notifications (bell dropdown)
router.get('/notifications', getNotifications);
router.patch('/notifications/read-all', markAllNotificationsRead);
router.patch('/notifications/:id/read', markNotificationRead);

// Contact inbox
router.get('/contact-messages', listContactMessages);
router.patch('/contact-messages/:id', updateContactMessage);

export default router;
