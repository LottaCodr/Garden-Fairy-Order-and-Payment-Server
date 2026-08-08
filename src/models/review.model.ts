import { Schema, model, Document, Types } from 'mongoose';

export interface IReview extends Document {
    product: Types.ObjectId;
    user: Types.ObjectId;
    rating: number;
    comment?: string;
    createdAt: Date;
}

const ReviewSchema = new Schema<IReview>({
  product: { type: Schema.Types.ObjectId, ref: 'Plant', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String },
}, { timestamps: { createdAt: true, updatedAt: false } });

// One review per user per product.
ReviewSchema.index({ product: 1, user: 1 }, { unique: true });
ReviewSchema.index({ product: 1, createdAt: -1 });

export const Review = model<IReview>('Review', ReviewSchema);
