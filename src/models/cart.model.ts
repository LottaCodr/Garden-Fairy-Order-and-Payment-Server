import { Schema, model, Document, Types } from 'mongoose';

export interface ICartItem {
    _id?: Types.ObjectId;
    product: Types.ObjectId;
    qty: number;
    size?: string;
}

export interface ICart extends Document {
    user?: Types.ObjectId;
    sessionId?: string;      // guest carts follow the session cookie
    items: ICartItem[];
}

const CartSchema = new Schema<ICart>({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  sessionId: { type: String },
  items: [{ product: { type: Schema.Types.ObjectId, ref: 'Plant' }, qty: Number, size: String }],
}, { timestamps: true });

// A registered user has at most one cart; a guest session likewise.
CartSchema.index({ user: 1 }, { unique: true, sparse: true });
CartSchema.index({ sessionId: 1 }, { unique: true, sparse: true });

export const Cart = model<ICart>('Cart', CartSchema);
