import { request, Request, Response } from "express";
import crypto from "crypto";
import flwClient from "@src/services/flutterwave.service";
import { Payment } from "@src/models/payment.model";

export const flutterwaveWebhook = async (req: Request, res: Response) => {
    try {
        const hash = crypto
            .createHmac("sha256", process.env.FLW_WEBHOOK_SECRET!)
            .update(JSON.stringify(req.body))
            .digest("hex");

        if (hash != req.headers["verify-hash"]) {
            return res.status(401).send("Invalid siganture");
        }

        const { tx_ref, status, id } = req.body.data;

        if (status != "successful") return res.sendStatus(200)

        const verify = await flwClient.get(`/transactions/${id}/verify`);
        if (verify.data.data.status != "successful") return res.sendStatus(200);

        await Payment.findOneAndUpdate(
            {
                flutterwaveRef: tx_ref
            },
            {
                status: "successful",
                transactionId: id
            }
        )

        // TODO: mark order as PAID
        const payment = await Payment.findOne({ flutterwaveRef: tx_ref });
        if (payment && payment.order) {
            const { Order } = await import("@src/models/order.model");
            await Order.findByIdAndUpdate(payment.order, {
                "payment.status": "paid",
                "payment.reference": id,
                status: "paid"
            });
        }
        res.sendStatus(200)
    } catch (error) {
        console.error("Error processing Flutterwave webhook:", error);
        res.status(500).send("Webhook processing failed");
    }
}