import { Router } from "express";
import {
    getCart,
    addCartItem,
    updateCartItem,
    removeCartItem
} from "../controllers/cart.controller";

// NOTE: You would typically add authentication middleware (e.g., requireAuth) to these routes

const router = Router();

// Get current user's cart
router.get("/", getCart);

// Add item to cart
router.post("/items", addCartItem);

// Update a specific cart item (by item's _id)
router.put("/items/:id", updateCartItem);

// Remove a cart item
router.delete("/items/:id", removeCartItem);

export default router;
