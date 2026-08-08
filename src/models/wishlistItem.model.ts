import { Schema, model, Document, Types } from 'mongoose';

export interface IWishlistItem extends Document {
    user: Types.ObjectId;
    product: Types.ObjectId;
    createdAt: Date;
}

const WishlistItemSchema = new Schema<IWishlistItem>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  product: { type: Schema.Types.ObjectId, ref: 'Plant', required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

WishlistItemSchema.index({ user: 1, product: 1 }, { unique: true });

export const WishlistItem = model<IWishlistItem>('WishlistItem', WishlistItemSchema);
