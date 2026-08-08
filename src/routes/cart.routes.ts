import { Router } from 'express';
import {
  getCart,
  addCartItem,
  setCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
} from '../controllers/cart.controller';
import { optionalAuth } from '@src/middlewares/auth.middleware';
import { ensureSession } from '@src/middlewares/session.middleware';

const router = Router();

// All cart routes work for both authenticated users and guest sessions.
router.use(optionalAuth, ensureSession);

router.get('/', getCart);
router.delete('/', clearCart);
router.post('/items', addCartItem);        // add/increment
router.put('/items', setCartItem);         // set absolute quantity
router.put('/items/:id', updateCartItem);  // by item _id or product id
router.delete('/items/:id', removeCartItem);

export default router;
