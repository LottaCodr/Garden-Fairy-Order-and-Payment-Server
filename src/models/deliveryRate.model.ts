import { Schema, model, Document } from 'mongoose';

export interface IDeliveryRate extends Document {
    state: string;
    area?: string;
    fee: number;       // kobo-naira integer (₦)
    etaDays: number;
}

const DeliveryRateSchema = new Schema<IDeliveryRate>({
  state: { type: String, required: true, index: true },
  area: { type: String },
  fee: { type: Number, required: true },
  etaDays: { type: Number, required: true },
}, { timestamps: true });

DeliveryRateSchema.index({ state: 1, area: 1 }, { unique: true, sparse: true });

export const DeliveryRate = model<IDeliveryRate>(
  'DeliveryRate',
  DeliveryRateSchema,
);
