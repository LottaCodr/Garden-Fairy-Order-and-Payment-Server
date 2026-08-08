import { Request, Response, NextFunction } from 'express';
import { Cart } from '../models/cart.model';
import { Plant } from '../models/plant.model';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

/**
 * Get the current user's cart.
 * req.user is populated by the auth middleware.
 */
export const getCart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ msg: 'Unauthorized' });
    }

    let cart = await Cart.findOne({ user: user.id }).populate('items.product');
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
    const user = req.user;
    if (!user) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ msg: 'Unauthorized' });
    }

    const { product, qty, size } = req.body ?? {};
    const qtyNum = Number(qty);

    if (typeof product !== 'string' || !product) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ msg: 'product is required' });
    }
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ msg: 'qty must be a positive integer' });
    }

    // The product must exist and have enough stock for the requested qty.
    const plant = await Plant.findById(product);
    if (!plant) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ msg: 'Product not found' });
    }

    let cart = await Cart.findOne({ user: user.id });
    if (!cart) cart = await Cart.create({ user: user.id, items: [] });

    // Check if item exists (with same product and size)
    const idx = cart.items.findIndex(
      (it) =>
        it.product.toString() === product &&
        (it.size ?? null) === (size ?? null),
    );

    const newQty = (idx > -1 ? cart.items[idx].qty : 0) + qtyNum;
    if (plant.stock < newQty) {
      return res.status(HTTP_STATUS_CODES.Conflict).json({
        msg: `Only ${plant.stock} unit(s) of "${plant.name}" in stock`,
      });
    }

    if (idx > -1) {
      cart.items[idx].qty = newQty;
    } else {
      cart.items.push({ product: plant._id, qty: qtyNum, size });
    }

    await cart.save();
    await cart.populate('items.product');
    res.status(HTTP_STATUS_CODES.Created).json({ data: cart });
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
    const user = req.user;
    if (!user) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ msg: 'Unauthorized' });
    }

    const { id } = req.params;
    const { qty, size } = req.body ?? {};

    if (qty !== undefined && (!Number.isInteger(Number(qty)) || Number(qty) <= 0)) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ msg: 'qty must be a positive integer' });
    }

    const cart = await Cart.findOne({ user: user.id });
    if (!cart) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ msg: 'Cart not found' });
    }

    // Find cart item by _id (id string match with toString())
    const item = cart.items.find((it) => it._id && it._id.toString() === id);
    if (!item) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ msg: 'Item not found' });
    }

    if (qty !== undefined) item.qty = Number(qty);
    if (size !== undefined) item.size = size;

    await cart.save();
    await cart.populate('items.product');
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
    const user = req.user;
    if (!user) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ msg: 'Unauthorized' });
    }

    const { id } = req.params;

    const cart = await Cart.findOne({ user: user.id });
    if (!cart) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ msg: 'Cart not found' });
    }

    // Find item index by _id
    const idx = cart.items.findIndex((it) => it._id && it._id.toString() === id);
    if (idx === -1) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ msg: 'Item not found' });
    }

    cart.items.splice(idx, 1);

    await cart.save();
    await cart.populate('items.product');
    res.json({ data: cart });
  } catch (err) {
    next(err);
  }
};

/**
 * Remove every item from the user's cart (e.g. after checkout).
 */
export const clearCart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ msg: 'Unauthorized' });
    }

    const cart = await Cart.findOne({ user: user.id });
    if (!cart) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ msg: 'Cart not found' });
    }

    cart.items.splice(0, cart.items.length);
    await cart.save();
    res.json({ data: cart });
  } catch (err) {
    next(err);
  }
};
