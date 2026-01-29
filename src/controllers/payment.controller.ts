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







