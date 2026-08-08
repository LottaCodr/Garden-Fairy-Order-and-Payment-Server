import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Order } from '../models/order.model';
import { Plant } from '../models/plant.model';
import { Cart } from '../models/cart.model';
import { Payment } from '../models/payment.model';
import flwClient from '@src/services/flutterwave.service';
import {
  reserveStock,
  releaseStock,
  restockOrder,
} from '@src/services/order.service';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

const FLW_REDIRECT = process.env.FLUTTERWAVE_REDIRECT_URL;
const DELIVERY_METHODS = ['standard', 'express'] as const;

// Raw request-body item (untrusted input — fields validated before use).
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
export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { items, shippingAddress, deliveryMethod } = req.body ?? {};

    const validationError = validateCreatePayload(req.body ?? {});
    if (validationError) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ message: validationError });
    }

    // Delivery fee estimate — simplistic rule (replace with a partner API).
    const deliveryFee = deliveryMethod === 'express' ? 2500 : 1200;

    let subtotal = 0;
    const itemsDetailed: {
      product: Types.ObjectId; name: string; price: number; qty: number;
      image: string; size?: string;
    }[] = [];
    const reserved: { productId: string; qty: number }[] = [];

    // Undo all reservations made so far (used on every failure path).
    const releaseReserved = async () => {
      await Promise.all(
        reserved.map((r) => releaseStock(r.productId, r.qty)),
      );
      reserved.length = 0;
    };

    // 1. Reserve stock for every line item — atomically, so concurrent
    //    checkouts can never oversell.
    for (const it of items as IRawOrderItem[]) {
      const productId = String(it.productId);
      const qty = Number(it.qty);
      const size = typeof it.size === 'string' ? it.size : undefined;

      let product;
      try {
        product = await reserveStock(productId, qty);
      } catch (err) {
        await releaseReserved();
        throw err;
      }

      if (!product) {
        // Another checkout won the race, or the item does not exist:
        // release what we already took before answering.
        await releaseReserved();
        const plant = await Plant.findById(productId).select('name stock');
        return res.status(HTTP_STATUS_CODES.Conflict).json({
          message: plant
            ? `Not enough stock for "${plant.name}" (${plant.stock} left)`
            : `Product not found: ${productId}`,
        });
      }
      reserved.push({ productId, qty });

      subtotal += product.price * qty;
      itemsDetailed.push({
        product: product._id,
        name: product.name,
        price: product.price,
        qty,
        image: product.imageUrl?.[0]?.url || '',
        size,
      });
    }

    const total = subtotal + deliveryFee;

    // 2. Create the order + payment records and initialize the hosted
    //    payment. Any failure here rolls everything back so no orphan
    //    orders or stock reservations are left behind.
    let order;
    let txRef = '';
    let paymentLink: string | undefined;
    try {
      order = await Order.create({
        user: user.id,
        items: itemsDetailed,
        shippingAddress,
        payment: { provider: 'flutterwave', status: 'unpaid', amount: total },
        delivery: { fee: deliveryFee, status: 'pending' },
        status: 'pending_payment',
        total,
      });

      txRef = `GF-${order._id.toString()}-${Date.now()}`;

      // A Payment document must exist for the tx_ref so the webhook (and
      // the verify endpoint) can link the payment back to this order.
      const payment = await Payment.create({
        user: user.id,
        order: order._id,
        amount: total,
        flutterwaveRef: txRef,
        idempotencyKey: `order-${order._id.toString()}`,
      });

      // Initialize the Flutterwave hosted payment page.
      const payload = {
        tx_ref: txRef,
        amount: total,
        currency: 'NGN',
        redirect_url: FLW_REDIRECT,
        customer: {
          email: (shippingAddress?.email as string) || user.email,
          phone_number: shippingAddress?.phone,
          name: shippingAddress?.name || user.name,
        },
        meta: { orderId: order._id.toString(), paymentId: payment._id.toString() },
        customizations: {
          title: 'Garden Fairy',
          description: `Payment for order ${order._id.toString()}`,
        },
      };

      const response = await flwClient.post('/payments', payload);
      paymentLink = response.data?.data?.link;
    } catch (err) {
      if (order) {
        await Payment.findOneAndDelete({ order: order._id, status: 'pending' });
        await Order.findByIdAndDelete(order._id);
      }
      await releaseReserved();
      throw err;
    }

    // The checkout consumed the cart — clear it.
    await Cart.findOneAndUpdate({ user: user.id }, { $set: { items: [] } });

    res.status(HTTP_STATUS_CODES.Created).json({
      order,
      txRef,
      paymentLink,
    });
  } catch (err) {
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

// Get a single order. Only the owner (or an admin) may view it.
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

    res.json({ data: order });
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
