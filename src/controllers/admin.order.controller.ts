import { Request, Response, NextFunction } from 'express';
import { Order, ORDER_STATUSES, OrderStatus } from '../models/order.model';
import { restockOrder } from '@src/services/order.service';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

// List all orders (newest first) with pagination and optional status filter.
export const listOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query as { status?: string };
    const pageNum = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (pageNum - 1) * perPage;

    const filter: Record<string, unknown> = {};
    if (status) {
      if (!ORDER_STATUSES.includes(status as OrderStatus)) {
        return res.status(HTTP_STATUS_CODES.BadRequest).json({
          message: `status must be one of: ${ORDER_STATUSES.join(', ')}`,
        });
      }
      filter.status = status;
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage),
      Order.countDocuments(filter),
    ]);

    res.json({
      data: orders,
      total,
      page: pageNum,
      pages: Math.ceil(total / perPage),
    });
  } catch (err) { next(err); }
};

// Get a single order by id (admin).
export const getOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(HTTP_STATUS_CODES.NotFound)
        .json({ message: 'Order not found' });
    }
    res.json({ data: order });
  } catch (err) { next(err); }
};

// Update order status and delivery details.
export const updateOrderStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, deliveryProvider, trackingId } = req.body ?? {};

    if (!ORDER_STATUSES.includes(status as OrderStatus)) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({
        message: `status must be one of: ${ORDER_STATUSES.join(', ')}`,
      });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(HTTP_STATUS_CODES.NotFound)
        .json({ message: 'Order not found' });
    }
    if (order.status === 'cancelled' && status !== 'cancelled') {
      return res.status(HTTP_STATUS_CODES.Conflict)
        .json({ message: 'A cancelled order cannot be reopened' });
    }

    const wasCancelled = order.status === 'cancelled';
    const isCancelling = status === 'cancelled' && !wasCancelled;

    order.status = status;
    if (deliveryProvider !== undefined) order.delivery.provider = deliveryProvider;
    if (trackingId !== undefined) order.delivery.trackingId = trackingId;
    if (status === 'shipped') order.delivery.status = 'in_transit';
    if (status === 'delivered') {
      order.delivery.status = 'delivered';
      order.deliveredAt = new Date();
    }
    if (isCancelling) order.cancelledAt = new Date();

    await order.save();

    // Cancellation releases the reserved stock back to the catalogue.
    if (isCancelling) {
      await restockOrder(order);
    }

    res.json({ data: order });
  } catch (err) { next(err); }
};
