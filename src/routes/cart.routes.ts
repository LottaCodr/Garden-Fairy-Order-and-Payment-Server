import { Router } from 'express';
import {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
} from '../controllers/cart.controller';
import { protect } from '@src/middlewares/auth.middleware';

const router = Router();

// Get current user's cart
router.get('/', protect, getCart);

// Remove every item from the cart
router.delete('/', protect, clearCart);

// Add item to cart
router.post('/items', protect, addCartItem);

// Update a specific cart item (by item's _id)
router.put('/items/:id', protect, updateCartItem);

// Remove a cart item
router.delete('/items/:id', protect, removeCartItem);

export default router;
