import { Request, Response, NextFunction } from 'express';

import { quoteDelivery } from '@src/services/delivery.service';
import {
  placeOrder,
  previewSubtotal,
  OutOfStockError,
} from '@src/services/order.service';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

interface ICheckoutItem {
  productId?: unknown;
  qty?: unknown;
  size?: unknown;
}

const validateItems = (items: unknown): string | null => {
  if (!Array.isArray(items) || items.length === 0) {
    return 'items must be a non-empty array';
  }
  for (const [i, it] of (items as ICheckoutItem[]).entries()) {
    if (typeof it?.productId !== 'string' || !it.productId) {
      return `items[${i}].productId is required`;
    }
    if (!Number.isInteger(Number(it.qty)) || Number(it.qty) <= 0) {
      return `items[${i}].qty must be a positive integer`;
    }
  }
  return null;
};

/**
 * POST /api/checkout/estimate
 * Body: { state, city?, subtotal? } → delivery fee + ETA from the
 * DeliveryRate table + free-shipping rule from StoreSetting.
 */
export const estimateDelivery = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { state, city, subtotal } = req.body ?? {};

    if (typeof state !== 'string' || !state.trim()) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'state is required' });
    }
    const subtotalNum =
      subtotal === undefined ? 0 : Number(subtotal);
    if (Number.isNaN(subtotalNum) || subtotalNum < 0) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'subtotal must be a non-negative number' });
    }

    const quote = await quoteDelivery(
      state.trim(),
      typeof city === 'string' ? city : undefined,
      subtotalNum,
    );

    res.json({ data: { ...quote, currency: 'NGN' } });
  } catch (err) { next(err); }
};

/**
 * POST /api/checkout — guests and registered users.
 * Body: { items, shippingAddress, notes? }
 *
 * shippingAddress: { name, email, phone, street?, city, state }
 */
export const checkout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, shippingAddress, notes } = req.body ?? {};

    const itemsError = validateItems(items);
    if (itemsError) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ message: itemsError });
    }

    const addr = shippingAddress as Record<string, unknown> | undefined;
    if (!addr || typeof addr !== 'object') {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'shippingAddress is required' });
    }

    const user = req.user;
    const name = (addr.name as string) || user?.name;
    const email = (addr.email as string) || user?.email;
    const phone = (addr.phone as string) || user?.phone;

    if (!name) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'shippingAddress.name is required' });
    }
    if (!email) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'shippingAddress.email is required' });
    }
    if (!phone) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'shippingAddress.phone is required' });
    }
    if (typeof addr.state !== 'string' || !addr.state.trim()) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'shippingAddress.state is required' });
    }
    if (typeof addr.city !== 'string' || !addr.city.trim()) {
      return res.status(HTTP_STATUS_CODES.BadRequest)
        .json({ message: 'shippingAddress.city is required' });
    }

    // The subtotal is needed up front to quote delivery; placeOrder then
    // re-validates prices atomically during reservation, keeping the total
    // authoritative server-side.
    const normalizedItems = (items as ICheckoutItem[]).map((it) => ({
      productId: String(it.productId),
      qty: Number(it.qty),
      size: typeof it.size === 'string' ? it.size : undefined,
    }));

    const subtotal = await previewSubtotal(normalizedItems);

    const quote = await quoteDelivery(
      addr.state.trim(),
      addr.city.trim(),
      subtotal,
    );

    const placed = await placeOrder({
      userId: user?.id,
      sessionId: req.sessionId,
      customer: { name, email, phone },
      items: normalizedItems,
      shippingAddress: {
        name,
        email,
        phone,
        street: addr.street,
        city: addr.city,
        state: addr.state,
      },
      notes: typeof notes === 'string' ? notes : undefined,
      deliveryFee: quote.deliveryFee,
      etaDays: quote.etaDays,
    });

    res.status(HTTP_STATUS_CODES.Created).json({
      order: placed.order,
      txRef: placed.txRef,
      paymentLink: placed.paymentLink,
      deliveryFee: quote.deliveryFee,
      subtotal: placed.subtotal,
      total: placed.order.total,
    });
  } catch (err) {
    if (err instanceof OutOfStockError) {
      const status = err.available === null
        ? HTTP_STATUS_CODES.NotFound
        : HTTP_STATUS_CODES.Conflict;
      return res.status(status).json({ message: err.message });
    }
    next(err);
  }
};
