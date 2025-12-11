import { Request, Response, NextFunction } from "express";
import { Order } from "../models/order.model";

export const listOrders = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json({ data: orders });
    } catch (err) { next(err); }
};

export const updateOrderStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status, deliveryProvider, trackingId } = req.body;
        const order = await Order.findByIdAndUpdate(req.params.id,
            {
                status,
                "delivery.provider": deliveryProvider,
                "delivery.trackingId": trackingId,
                "delivery.status": status === "shipped" ? "in_transit" : (status === "delivered" ? "delivered" : undefined)
            },
            { new: true }
        );
        res.json({ data: order });
    } catch (err) { next(err); }
};
