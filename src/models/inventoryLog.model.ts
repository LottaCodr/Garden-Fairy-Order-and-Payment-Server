import { Schema, model, Document, Types } from 'mongoose';

export interface IInventoryLog extends Document {
    product: Types.ObjectId;
    delta: number;          // + restock, − sale
    reason: 'order' | 'restock' | 'adjustment' | 'cancellation';
    order?: Types.ObjectId;
    createdAt: Date;
}

const InventoryLogSchema = new Schema<IInventoryLog>({
  product: { type: Schema.Types.ObjectId, ref: 'Plant', required: true },
  delta: { type: Number, required: true },
  reason: {
    type: String,
    enum: ['order', 'restock', 'adjustment', 'cancellation'],
    required: true,
  },
  order: { type: Schema.Types.ObjectId, ref: 'Order' },
}, { timestamps: { createdAt: true, updatedAt: false } });

InventoryLogSchema.index({ product: 1, createdAt: -1 });
InventoryLogSchema.index({ order: 1 });

export const InventoryLog = model<IInventoryLog>(
  'InventoryLog',
  InventoryLogSchema,
);
