import { Schema, model, Document, Types } from "mongoose";

export interface ICart extends Document {
    user: Types.ObjectId;
    items: { product: Types.ObjectId; qty: number; size?: string }[];
}

const CartSchema = new Schema<ICart>({
    user: { type: Schema.Types.ObjectId, ref: "User" },
    items: [{ product: { type: Schema.Types.ObjectId, ref: "Plant" }, qty: Number, size: String }]
}, { timestamps: true });

export const Cart = model<ICart>("Cart", CartSchema);
