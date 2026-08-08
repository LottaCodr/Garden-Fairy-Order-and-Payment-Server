import { Request, Response, NextFunction } from 'express';
import { Order, IOrder } from '../models/order.model';
import { Payment } from '../models/payment.model';
import {
  placeOrder,
  previewSubtotal,
  restockOrder,
  OutOfStockError,
} from '@src/services/order.service';
import { quoteDelivery } from '@src/services/delivery.service';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

const DELIVERY_METHODS = ['standard', 'express'] as const;

interface IRawOrderItem {
  productId?: unknown;
  qty?: unknown;
  size?: unknown;
}

/**
 * Validate the create-order payload. Returns an error message or null.
 */
const validateCreatePayload = (body: Record<string, unknown>): string | null => {
  const { items, shippingAddress, deliveryMethod } = body ?? {};

  if (!Array.isArray(items) || items.length === 0) {
    return 'items must be a non-empty array';
  }
  for (const [i, it] of (items as Record<string, unknown>[]).entries()) {
    if (typeof it?.productId !== 'string' || !it.productId) {
      return `items[${i}].productId is required`;
    }
    if (!Number.isInteger(Number(it.qty)) || Number(it.qty) <= 0) {
      return `items[${i}].qty must be a positive integer`;
    }
  }

  const addr = shippingAddress as Record<string, unknown> | undefined;
  if (!addr || typeof addr !== 'object') {
    return 'shippingAddress is required';
  }
  if (typeof addr.state !== 'string' || !addr.state.trim()) {
    return 'shippingAddress.state is required';
  }
  if (typeof addr.city !== 'string' || !addr.city.trim()) {
    return 'shippingAddress.city is required';
  }
  if (typeof addr.phone !== 'string' || !addr.phone.trim()) {
    return 'shippingAddress.phone is required';
  }

  if (
    deliveryMethod !== undefined &&
    !DELIVERY_METHODS.includes(deliveryMethod as (typeof DELIVERY_METHODS)[number])
  ) {
    return `deliveryMethod must be one of: ${DELIVERY_METHODS.join(', ')}`;
  }

  return null;
};

// Create order: validates input, reserves stock atomically, records a
// Payment and initializes a Flutterwave hosted payment link.
//
// Delivery fee: an explicit deliveryMethod keeps the legacy express/
// standard override; otherwise the DeliveryRate table + free-shipping
// threshold from StoreSetting applies (spec business rules).
export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { items, shippingAddress, deliveryMethod } = req.body ?? {};

    const validationError = validateCreatePayload(req.body ?? {});
    if (validationError) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ message: validationError });
    }

    let deliveryFee: number;
    let etaDays: number | null = null;
    if (deliveryMethod !== undefined) {
      // Legacy flat override: express ₦2,500 / standard ₦1,200.
      deliveryFee = deliveryMethod === 'express' ? 2500 : 1200;
    } else {
      // Spec rule: DeliveryRate table + free-shipping threshold.
      const subtotal = await previewSubtotal(
        (items as IRawOrderItem[]).map((it) => ({
          productId: String(it.productId),
          qty: Number(it.qty),
        })),
      );
      const quote = await quoteDelivery(
        (shippingAddress.state as string).trim(),
        typeof shippingAddress.city === 'string'
          ? shippingAddress.city
          : undefined,
        subtotal,
      );
      deliveryFee = quote.deliveryFee;
      etaDays = quote.etaDays;
    }

    const placed = await placeOrder({
      userId: user.id,
      customer: {
        name: (shippingAddress.name as string) || user.name,
        email: (shippingAddress.email as string) || user.email,
        phone: shippingAddress.phone,
      },
      items: (items as IRawOrderItem[]).map((it) => ({
        productId: String(it.productId),
        qty: Number(it.qty),
        size: typeof it.size === 'string' ? it.size : undefined,
      })),
      shippingAddress,
      deliveryFee,
      etaDays,
    });

    res.status(HTTP_STATUS_CODES.Created).json({
      order: placed.order,
      txRef: placed.txRef,
      paymentLink: placed.paymentLink,
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

// List the authenticated user's orders (newest first, paginated).
export const getMyOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const pageNum = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const skip = (pageNum - 1) * perPage;

    const [orders, total] = await Promise.all([
      Order.find({ user: user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),
      Order.countDocuments({ user: user.id }),
    ]);

    res.json({
      data: orders,
      total,
      page: pageNum,
      pages: Math.ceil(total / perPage),
    });
  } catch (err) { next(err); }
};

/** Derive a status timeline from the order's timestamps. */
const buildTimeline = (order: IOrder) => {
  const timeline: { status: string; at: Date | null }[] = [
    { status: 'pending_payment', at: order.get('createdAt') ?? null },
  ];
  if (order.paidAt) timeline.push({ status: 'paid', at: order.paidAt });
  const deliveryStatus = order.delivery?.status;
  if (deliveryStatus === 'in_transit' || deliveryStatus === 'delivered') {
    timeline.push({ status: 'shipped', at: null });
  }
  if (order.deliveredAt) timeline.push({ status: 'delivered', at: order.deliveredAt });
  if (order.cancelledAt) timeline.push({ status: 'cancelled', at: order.cancelledAt });
  return timeline;
};

// Get a single order (with status timeline). Only the owner or an admin.
export const getOrderById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'Order not found' });
    }
    const isOwner = order.user?.toString() === user.id;
    if (!isOwner && user.role !== 'admin') {
      return res.status(HTTP_STATUS_CODES.Forbidden)
        .json({ message: 'You do not have access to this order' });
    }

    res.json({ data: order, timeline: buildTimeline(order) });
  } catch (err) { next(err); }
};

// Cancel an order that is still awaiting payment, restoring its stock.
export const cancelOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(HTTP_STATUS_CODES.NotFound).json({ message: 'Order not found' });
    }
    const isOwner = order.user?.toString() === user.id;
    if (!isOwner && user.role !== 'admin') {
      return res.status(HTTP_STATUS_CODES.Forbidden)
        .json({ message: 'You do not have access to this order' });
    }
    if (order.status !== 'pending_payment') {
      return res.status(HTTP_STATUS_CODES.Conflict).json({
        message: `Only orders awaiting payment can be cancelled (current status: ${order.status})`,
      });
    }

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    await order.save();

    // Restock the reserved items and void the pending payment record.
    await restockOrder(order);
    await Payment.findOneAndUpdate(
      { order: order._id, status: 'pending' },
      { status: 'failed' },
    );

    res.json({ data: order });
  } catch (err) { next(err); }
};
