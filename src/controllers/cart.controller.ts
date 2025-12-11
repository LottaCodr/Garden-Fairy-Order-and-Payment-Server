import { Request, Response, NextFunction } from "express";
import { Cart } from "../models/cart.model";
import { Plant } from "../models/plant.model";
import mongoose from "mongoose";

/**
 * Get the current user's cart.
 * req.user assumed to be populated by auth middleware.
 */
export const getCart = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = (req as any).user;
        if (!user) return res.status(401).json({ msg: "Unauthorized" });

        let cart = await Cart.findOne({ user: user.id }).populate("items.product");
        if (!cart) {
            // If user has no cart, create an empty one
            cart = await Cart.create({ user: user.id, items: [] });
        }
        res.json({ data: cart });
    } catch (err) {
        next(err);
    }
};

/**
 * Add a product to the cart (or increment quantity if already present).
 * Expects: { product, qty, size? }
 */
export const addCartItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = (req as any).user;
        if (!user) return res.status(401).json({ msg: "Unauthorized" });

        const { product, qty, size } = req.body;
        if (!product || qty <= 0) return res.status(400).json({ msg: "Invalid input" });

        let cart = await Cart.findOne({ user: user.id });
        if (!cart) cart = await Cart.create({ user: user.id, items: [] });

        // Check if item exists (with same product and size)
        const idx = cart.items.findIndex(
            (it: any) =>
                it.product.toString() === product &&
                (it.size ?? null) === (size ?? null)
        );

        if (idx > -1) {
            cart.items[idx].qty += qty;
        } else {
            cart.items.push({ product, qty, size });
        }

        await cart.save();
        await cart.populate("items.product");
        res.status(201).json({ data: cart });
    } catch (err) {
        next(err);
    }
};

/**
 * Update a specific cart item quantity/variant.
 * Route: PUT /cart/items/:id (id = cart item's _id)
 * Expects: { qty, size? }
 */
export const updateCartItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = (req as any).user;
        if (!user) return res.status(401).json({ msg: "Unauthorized" });

        const { id } = req.params;
        const { qty, size } = req.body;

        let cart = await Cart.findOne({ user: user.id });
        if (!cart) return res.status(404).json({ msg: "Cart not found" });

        // Find cart item by _id (id string match with toString())
        const item = cart.items.find((it: any) => it._id && it._id.toString() === id);
        if (!item) return res.status(404).json({ msg: "Item not found" });

        if (qty !== undefined) item.qty = qty;
        if (size !== undefined) item.size = size;

        await cart.save();
        await cart.populate("items.product");
        res.json({ data: cart });
    } catch (err) {
        next(err);
    }
};

/**
 * Remove a cart item.
 * Route: DELETE /cart/items/:id (id = cart item's _id)
 */
export const removeCartItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = (req as any).user;
        if (!user) return res.status(401).json({ msg: "Unauthorized" });

        const { id } = req.params;

        let cart = await Cart.findOne({ user: user.id });
        if (!cart) return res.status(404).json({ msg: "Cart not found" });

        // Find item index by _id
        const idx = cart.items.findIndex((it: any) => it._id && it._id.toString() === id);
        if (idx === -1) return res.status(404).json({ msg: "Item not found" });

        cart.items.splice(idx, 1);

        await cart.save();
        await cart.populate("items.product");
        res.json({ data: cart });
    } catch (err) {
        next(err);
    }
};

/** 
 * NOTE: The following should be added in src/models/plant.model.ts
 * 
 * PlantSchema.index({ name: "text", category: 1, tags: 1, "care.sunlight": 1 });
 * 
 * This creates indexes for searchability by name, category, tags, sunlight etc.
 */

/**
 * 
 * NOTE: In src/controllers/order.controller.ts, when decrementing inventory (stock)
 * for a Plant when creating an order, you MUST use findOneAndUpdate with $inc.
 * E.g.:
 * 
 * await Plant.findOneAndUpdate(
 *   { _id: it.productId, stock: { $gte: it.qty } },
 *   { $inc: { stock: -it.qty } }
 * );
 * 
 * Optionally, wrap all stock decrements & order creation in a Mongoose session/transaction.
 */

