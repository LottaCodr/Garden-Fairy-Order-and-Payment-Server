import { Schema, model, Document, Types } from "mongoose";

export interface IOrderItem {
    product: Types.ObjectId;
    name: string;
    price: number;
    qty: number;
    size?: string;
    image?: string;
    fragile?: boolean;
}

export interface IOrder extends Document {
    user?: Types.ObjectId;
    items: IOrderItem[];
    shippingAddress: {
        state: string;
        city: string;
        street?: string;
        phone: string;
        name?: string;
    };
    payment: {
        provider: string;
        status: string;
        reference?: string;
        amount: number;
    };
    delivery: {
        provider?: string;
        trackingId?: string;
        status?: string;
        etaDays?: number;
        fee?: number;
    };
    status: string;
    total: number;
}

const OrderSchema = new Schema<IOrder>({
    user: { type: Schema.Types.ObjectId, ref: "User" },
    items: [{
        product: { type: Schema.Types.ObjectId, ref: "Plant", required: true },
        name: String,
        price: Number,
        qty: Number,
        size: String,
        image: String,
        fragile: Boolean
    }],
    shippingAddress: {
        state: String, city: String, street: String, phone: String, name: String
    },
    payment: {
        provider: String, status: { type: String, default: "unpaid" }, reference: String, amount: Number
    },
    delivery: {
        provider: String, trackingId: String, status: String, etaDays: Number, fee: Number
    },
    status: { type: String, default: "pending_payment" },
    total: Number
}, { timestamps: true });

export const Order = model<IOrder>("Order", OrderSchema);
