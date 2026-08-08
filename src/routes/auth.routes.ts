import { Router } from 'express';
import {
  signup,
  signin,
  refresh,
  signout,
  demoLogin,
  forgotPassword,
  resetPassword,
  me,
  updateMe,
  addAddress,
  updateAddress,
  deleteAddress,
} from '../controllers/auth.controller';
import { protect } from '@src/middlewares/auth.middleware';
import {
  limitSignin,
  limitSignup,
  limitPasswordReset,
} from '@src/middlewares/rateLimit.middleware';

const router = Router();

// Spec surface (frontend-facing)
router.post('/signup', limitSignup, signup);
router.post('/signin', limitSignin, signin);
router.post('/refresh', refresh);
router.post('/signout', signout);
router.post('/demo-login', demoLogin);
router.post('/forgot-password', limitPasswordReset, forgotPassword);
router.post('/reset-password', limitPasswordReset, resetPassword);

// Back-compat aliases (existing clients)
router.post('/register', limitSignup, signup);
router.post('/login', limitSignin, signin);

// Profile
router.get('/me', protect, me);
router.put('/me', protect, updateMe);
router.patch('/me', protect, updateMe);

// Address book
router.post('/me/addresses', protect, addAddress);
router.put('/me/addresses/:addrId', protect, updateAddress);
router.delete('/me/addresses/:addrId', protect, deleteAddress);

export default router;
