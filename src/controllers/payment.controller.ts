import { Order } from "../models/order.model";
import { Request, Response } from "express";
import crypto from "crypto";
import flwClient from "@src/services/flutterwave.service";
import { Payment } from "@src/models/payment.model";

export const initializePayment = async (req: Request , res: Response) => {
    const { orderId, amount } = req.body;
    const userId = req.user?.id;

    const idempotencyKey =
        req.headers["idempotency-key"]?.toString() ||
        crypto.randomUUID();

    // Check idempotency
    const existing = await Payment.findOne({ idempotencyKey });
    if (existing) {
        return res.json(existing);
    }

    const txRef = `GF-${Date.now()}`;

    const payment = await Payment.create({
        user: userId,
        order: orderId,
        amount,
        flutterwaveRef: txRef,
        idempotencyKey,
    });

    const response = await flwClient.post("/payments", {
        tx_ref: txRef,
        amount,
        currency: "NGN",
        redirect_url: "https://yourfrontend.com/payment-success",
        customer: {
            email: req.user!.email,
            name: req.user!.name,
        },
        customizations: {
            title: "Garden Fairy",
            description: "Plant Purchase",
            logo: "https://yourlogo.png",
        },
    });

    res.status(200).json({
        paymentLink: response.data.data.link,
    });
};






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
