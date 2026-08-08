import { Plant } from '@src/models/plant.model';
import { Order } from '@src/models/order.model';
import type { IOrder } from '@src/models/order.model';

export interface IOrderItemInput {
  productId: string;
  qty: number;
  size?: string;
  price?: number;
}

/**
 * Atomically reserve stock for a single order item using a conditional
 * `findOneAndUpdate` ($inc) — only succeeds when enough stock is available,
 * which prevents overselling under concurrent checkouts.
 */
export const reserveStock = async (productId: string, qty: number) => {
  return Plant.findOneAndUpdate(
    { _id: productId, stock: { $gte: qty } },
    { $inc: { stock: -qty, sold: qty } },
    { new: true },
  );
};

/**
 * Release previously reserved stock back to the catalogue.
 */
export const releaseStock = async (productId: string, qty: number) => {
  return Plant.findOneAndUpdate(
    { _id: productId },
    { $inc: { stock: qty, sold: -qty } },
    { new: true },
  );
};

/**
 * Restore the stock of every item on an order (e.g. when it gets cancelled).
 */
export const restockOrder = async (order: Pick<IOrder, 'items'>) => {
  await Promise.all(
    order.items.map((item) =>
      releaseStock(item.product.toString(), item.qty)),
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
