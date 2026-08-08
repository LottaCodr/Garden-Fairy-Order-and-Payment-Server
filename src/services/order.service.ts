import { Types } from 'mongoose';

import { Plant } from '@src/models/plant.model';
import { Order } from '@src/models/order.model';
import { Cart } from '@src/models/cart.model';
import { Payment } from '@src/models/payment.model';
import { InventoryLog } from '@src/models/inventoryLog.model';
import type { IOrder } from '@src/models/order.model';
import flwClient from '@src/services/flutterwave.service';
import {
  maybeNotifyLowStock,
  notifyNewOrder,
} from '@src/services/notification.service';

const FLW_REDIRECT = process.env.FLUTTERWAVE_REDIRECT_URL;

export interface IOrderItemInput {
  productId: string;
  qty: number;
  size?: string;
}

/** Reason strings logged alongside the inventory movement. */
type InventoryReason = 'order' | 'restock' | 'adjustment' | 'cancellation';

/**
 * Write an inventory movement. Logging failures must not break the
 * triggering operation, so they are reported and swallowed.
 */
export const logInventory = async (
  productId: string | Types.ObjectId,
  delta: number,
  reason: InventoryReason,
  orderId?: string | Types.ObjectId,
) => {
  try {
    await InventoryLog.create({
      product: productId,
      delta,
      reason,
      order: orderId,
    });
  } catch (err) {
    console.error('Failed to write inventory log:', err);
  }
};

/**
 * Atomically reserve stock for a single order item using a conditional
 * `findOneAndUpdate` ($inc) — only succeeds when enough stock is available,
 * which prevents overselling under concurrent checkouts.
 */
export const reserveStock = async (productId: string, qty: number) => {
  return Plant.findOneAndUpdate(
    { _id: productId, status: 'active', stock: { $gte: qty } },
    { $inc: { stock: -qty, sold: qty } },
    { new: true },
  );
};

/**
 * Release previously reserved stock back to the catalogue.
 */
export const releaseStock = async (
  productId: string,
  qty: number,
  logContext?: { reason?: InventoryReason; orderId?: string | Types.ObjectId },
) => {
  const updated = await Plant.findOneAndUpdate(
    { _id: productId },
    { $inc: { stock: qty, sold: -qty } },
    { new: true },
  );
  await logInventory(
    productId,
    qty,
    logContext?.reason ?? 'restock',
    logContext?.orderId,
  );
  return updated;
};

/**
 * Restore the stock of every item on an order (e.g. when it gets cancelled).
 */
export const restockOrder = async (
  order: Pick<IOrder, '_id' | 'items'>,
) => {
  await Promise.all(
    order.items.map((item) =>
      releaseStock(item.product.toString(), item.qty, {
        reason: 'restock',
        orderId: order._id,
      })),
  );
};

/**
 * Cancel an order (if not already cancelled/delivered), restoring its stock.
 */
export const cancelOrderAndRestock = async (orderId: string) => {
  const order = await Order.findByIdAndUpdate(
    orderId,
    {
      status: 'cancelled',
      cancelledAt: new Date(),
    },
    { new: true },
  );

  if (order) {
    await restockOrder(order);
  }

  return order;
};

// ---------------------------------------------------------------------------
// placeOrder — the shared transactional checkout core
// ---------------------------------------------------------------------------

export class OutOfStockError extends Error {
  public productId: string;
  public available: number | null;
  public productName: string | null;

  constructor(
    productId: string,
    available: number | null,
    productName: string | null,
  ) {
    super(
      available === null
        ? `Product not found: ${productId}`
        : `Not enough stock for "${productName}" (${available} left)`,
    );
    this.productId = productId;
    this.available = available;
    this.productName = productName;
  }
}

/**
 * Price a list of order items from the catalogue (used to quote delivery
 * before reserving). Throws OutOfStockError for an unknown product.
 * The final authoritative total is still computed atomically in placeOrder.
 */
export const previewSubtotal = async (items: IOrderItemInput[]): Promise<number> => {
  let subtotal = 0;
  for (const it of items) {
    const plant = await Plant.findById(it.productId).select('price name');
    if (!plant) throw new OutOfStockError(it.productId, null, null);
    subtotal += plant.price * it.qty;
  }
  return subtotal;
};

export interface IPlaceOrderInput {
  userId?: string;
  sessionId?: string;
  customer: { name: string; email: string; phone: string };
  items: IOrderItemInput[];
  shippingAddress: Record<string, unknown>;
  notes?: string;
  deliveryFee: number;
  etaDays?: number | null;
}

export interface IPlacedOrder {
  order: IOrder;
  txRef: string;
  paymentLink?: string;
  subtotal: number;
}

/**
 * Reserve stock → create order + payment → initialize a Flutterwave hosted
 * payment → inventory logs + admin notifications → clear the buyer's cart.
 *
 * Every failure path compensates what was already done (stock released,
 * order/payment removed) so no orphan reservations are left behind.
 */
export const placeOrder = async (
  input: IPlaceOrderInput,
): Promise<IPlacedOrder> => {
  let subtotal = 0;
  const itemsDetailed: IOrder['items'] = [];
  const reserved: { productId: string; qty: number }[] = [];

  const releaseReserved = async () => {
    await Promise.all(
      reserved.map((r) => releaseStock(r.productId, r.qty)),
    );
    reserved.length = 0;
  };

  // 1. Reserve stock for every line item — atomically, so concurrent
  //    checkouts can never oversell.
  for (const it of input.items) {
    const productId = it.productId;
    const qty = it.qty;
    const size = it.size;

    let product;
    try {
      product = await reserveStock(productId, qty);
    } catch (err) {
      await releaseReserved();
      throw err;
    }

    if (!product) {
      await releaseReserved();
      const plant = await Plant.findById(productId).select('name stock');
      throw new OutOfStockError(
        productId,
        plant ? plant.stock : null,
        plant?.name ?? null,
      );
    }
    reserved.push({ productId, qty });

    // Crossing below the low-stock threshold raises an admin alert.
    await maybeNotifyLowStock(
      productId,
      product.name,
      product.stock + qty,
      product.stock,
    );

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

  const total = subtotal + input.deliveryFee;

  // 2. Create the order + payment and initialize the hosted payment.
  let order;
  let txRef = '';
  let paymentLink: string | undefined;
  try {
    order = await Order.create({
      user: input.userId,
      customerName: input.customer.name,
      customerEmail: input.customer.email,
      phone: input.customer.phone,
      notes: input.notes,
      items: itemsDetailed,
      shippingAddress: input.shippingAddress,
      payment: { provider: 'flutterwave', status: 'unpaid', amount: total },
      delivery: {
        fee: input.deliveryFee,
        etaDays: input.etaDays ?? undefined,
        status: 'pending',
      },
      status: 'pending_payment',
      total,
    });

    txRef = `GF-${order._id.toString()}-${Date.now()}`;

    // A Payment document must exist for the tx_ref so the webhook (and
    // the verify endpoint) can link the payment back to this order.
    const payment = await Payment.create({
      user: input.userId,
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
        email: input.customer.email,
        phone_number: input.customer.phone,
        name: input.customer.name,
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

  // 3. Inventory movement log (delta −qty per item).
  await Promise.all(
    itemsDetailed.map((item) =>
      logInventory(item.product, -item.qty, 'order', order._id)),
  );

  // 4. Admin notification (bell dropdown).
  await notifyNewOrder(
    order._id.toString(),
    total,
    input.customer.name,
  );

  // 5. The checkout consumed the cart — clear it (user or guest session).
  if (input.userId) {
    await Cart.findOneAndUpdate({ user: input.userId }, { $set: { items: [] } });
  } else if (input.sessionId) {
    await Cart.findOneAndUpdate(
      { sessionId: input.sessionId },
      { $set: { items: [] } },
    );
  }

  return { order, txRef, paymentLink, subtotal };
};
