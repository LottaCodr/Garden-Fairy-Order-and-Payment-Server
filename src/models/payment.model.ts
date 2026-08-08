import { Schema, model, Document, Types } from 'mongoose';

export interface IPayment extends Document {
    user?: Types.ObjectId;   // optional — guest checkouts have no account
    order: Types.ObjectId;
    amount: number;
    currency: string;
    provider: string;        // flutterwave | paystack
    status: 'pending' | 'successful' | 'failed' | 'refunded';
    flutterwaveRef: string;  // tx_ref — our idempotency key at the PSP
    transactionId?: string;
    idempotencyKey: string;
    paidAt?: Date;
    rawWebhook?: unknown;
}


const paymentSchema = new Schema<IPayment>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },
    provider: { type: String, default: 'flutterwave' },
    status: {
      type: String,
      enum: ['pending', 'successful', 'failed', 'refunded'],
      default: 'pending',
    },
    flutterwaveRef: { type: String, required: true, unique: true },
    transactionId: String,
    idempotencyKey: { type: String, required: true, unique: true },
    paidAt: Date,
    rawWebhook: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

paymentSchema.index({ order: 1 });

export const Payment = model<IPayment>('Payment', paymentSchema);