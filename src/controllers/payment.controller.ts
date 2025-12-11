import { Request, Response } from "express";
import { Order } from "../models/order.model";

export const flutterwaveWebhook = async (req: Request, res: Response) => {
    // Validate signature if provided by provider
    // For illustration: extract orderId from meta (depends on how you initiated payment)
    try {
        const payload = req.body;
        // Example: payload.data.meta.orderId
        const meta = payload?.data?.meta;
        const orderId = meta?.orderId;
        const paymentStatus = payload?.data?.status; // "successful" etc

        if (paymentStatus === "successful") {
            // update order
            const order = await Order.findByIdAndUpdate(orderId, {
                "payment.status": "paid",
                "payment.reference": payload?.data?.id,
                status: "paid"
            }, { new: true });
            // TODO: create shipment using logistics provider
        }

        return res.json({ received: true });
    } catch (err) {
        console.error("Webhook error:", err);
        return res.status(500).json({ ok: false });
    }
};
