import { Schema, model, Document, Types } from "mongoose";

export interface IPayment extends Document {
    user: Types.ObjectId;
    order: Types.ObjectId;
    amount: number;
    currency: string;
    status: "pending" | "successful" | "failed";
    flutterwaveRef: string;
    transactionId?: string;
    idempotencyKey: string;
}


const paymentSchema = new Schema<IPayment>(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
        amount: { type: Number, required: true },
        currency: { type: String, default: "NGN" },
        status: { type: String, default: "pending" },
        flutterwaveRef: { type: String, required: true },
        transactionId: String,
        idempotencyKey: { type: String, required: true, unique: true },
    },
    { timestamps: true }
);

export const Payment = model<IPayment>("Payment", paymentSchema)