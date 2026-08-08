import { Request, Response, NextFunction } from 'express';
import { Cart, ICart } from '../models/cart.model';
import { Plant } from '../models/plant.model';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

/**
 * Cart routes use `optionalAuth` + `ensureSession`, so identity is the user
 * id when logged in and the guest session cookie otherwise.
 */
const ownerFilter = (req: Request): { user?: string; sessionId?: string } =>
  req.user ? { user: req.user.id } : { sessionId: req.sessionId! };

const findOrCreateCart = async (req: Request): Promise<ICart> => {
  const filter = ownerFilter(req);
  let cart = await Cart.findOne(filter).populate('items.product');
  if (!cart) {
    cart = await Cart.create({ ...filter, items: [] });
    await cart.populate('items.product');
  }
  return cart;
};

/** Items expose live price/stock so stale client carts can't mis-check out. */
const serializeCart = (cart: ICart) => {
  let subtotal = 0;
  const items = cart.items.map((it) => {
    // Populated product docs carry fresh pricing/stock.
    const product = it.product as unknown as {
      _id: { toString(): string }; name?: string; price?: number;
      stock?: number; imageUrl?: { url: string }[]; status?: string;
    };
    const price = product?.price ?? 0;
    subtotal += price * it.qty;
    return {
      id: it._id?.toString(),
      product: product?._id,
      name: product?.name,
      price,
      stock: product?.stock,
      image: product?.imageUrl?.[0]?.url ?? '',
      qty: it.qty,
      size: it.size,
      lineTotal: price * it.qty,
    };
  });
  return { id: cart._id, items, subtotal };
};

/**
 * GET /api/cart — get (or lazily create) the cart.
 */
export const getCart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cart = await findOrCreateCart(req);
    res.json({ data: serializeCart(cart) });
  } catch (err) {
    next(err);
  }
};

const validateQty = (raw: unknown): number | null => {
  const qty = Number(raw);
  return Number.isInteger(qty) && qty > 0 ? qty : null;
};

/**
 * Shared add/upsert logic. `mode = 'add'` increments; mode = 'set' is absolute.
 */
const upsertCartItem = async (
  req: Request,
  res: Response,
  next: NextFunction,
  mode: 'add' | 'set',
) => {
  try {
    const { product, qty, size } = req.body ?? {};
    const qtyNum = validateQty(qty);

    if (typeof product !== 'string' || !product) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ msg: 'product is required' });
    }
    if (qtyNum === null) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ msg: 'qty must be a positive integer' });
    }

    const plant = await Plant.findById(product);
    if (!plant || plant.status === 'archived') {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ msg: 'Product not found' });
    }

    const filter = ownerFilter(req);
    let cart = await Cart.findOne(filter);
    if (!cart) cart = await Cart.create({ ...filter, items: [] });

    const idx = cart.items.findIndex(
      (it) =>
        it.product.toString() === product &&
        (it.size ?? null) === (size ?? null),
    );

    const lineQty = mode === 'add'
      ? (idx > -1 ? cart.items[idx].qty : 0) + qtyNum
      : qtyNum;

    if (plant.stock < lineQty) {
      return res.status(HTTP_STATUS_CODES.Conflict).json({
        msg: `Only ${plant.stock} unit(s) of "${plant.name}" in stock`,
      });
    }

    if (idx > -1) {
      cart.items[idx].qty = lineQty;
    } else {
      cart.items.push({ product: plant._id, qty: lineQty, size });
    }

    await cart.save();
    await cart.populate('items.product');
    res.status(mode === 'add' ? HTTP_STATUS_CODES.Created : HTTP_STATUS_CODES.Ok)
      .json({ data: serializeCart(cart) });
  } catch (err) {
    next(err);
  }
};

export const addCartItem = (
  req: Request,
  res: Response,
  next: NextFunction,
) => upsertCartItem(req, res, next, 'add');

// Spec shape — PUT /api/cart/items with {product, qty, size?} (absolute).
export const setCartItem = (
  req: Request,
  res: Response,
  next: NextFunction,
) => upsertCartItem(req, res, next, 'set');

/**
 * Resolve an ":id" route param to a cart item — either the item's own _id
 * or its product id are accepted (frontends use either).
 */
const findItemIndex = (cart: ICart, id: string): number =>
  cart.items.findIndex(
    (it) =>
      it._id?.toString() === id || it.product.toString() === id,
  );

export const updateCartItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { qty, size } = req.body ?? {};

    if (qty !== undefined && validateQty(qty) === null) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ msg: 'qty must be a positive integer' });
    }

    const cart = await Cart.findOne(ownerFilter(req));
    if (!cart) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ msg: 'Cart not found' });
    }

    const idx = findItemIndex(cart, id);
    if (idx === -1) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ msg: 'Item not found' });
    }

    if (qty !== undefined) {
      const plant = await Plant.findById(cart.items[idx].product);
      if (plant && plant.stock < Number(qty)) {
        return res.status(HTTP_STATUS_CODES.Conflict).json({
          msg: `Only ${plant.stock} unit(s) of "${plant.name}" in stock`,
        });
      }
      cart.items[idx].qty = Number(qty);
    }
    if (size !== undefined) cart.items[idx].size = size;

    await cart.save();
    await cart.populate('items.product');
    res.json({ data: serializeCart(cart) });
  } catch (err) {
    next(err);
  }
};

export const removeCartItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const cart = await Cart.findOne(ownerFilter(req));
    if (!cart) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ msg: 'Cart not found' });
    }

    const idx = findItemIndex(cart, id);
    if (idx === -1) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ msg: 'Item not found' });
    }

    cart.items.splice(idx, 1);
    await cart.save();
    await cart.populate('items.product');
    res.json({ data: serializeCart(cart) });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/cart — remove every item from the cart.
 */
export const clearCart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cart = await Cart.findOne(ownerFilter(req));
    if (!cart) {
      return res.json({ data: { items: [], subtotal: 0 } });
    }

    cart.items.splice(0, cart.items.length);
    await cart.save();
    res.json({ data: serializeCart(cart) });
  } catch (err) {
    next(err);
  }
};
