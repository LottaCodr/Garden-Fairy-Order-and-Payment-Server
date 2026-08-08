import { Schema, model, Document, Types } from 'mongoose';

export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'unpaid',
  'paid',
  'failed',
  'refunded',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const DELIVERY_STATUSES = [
  'pending',
  'in_transit',
  'delivered',
  'returned',
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

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
    // Denormalized customer fields — set for every order so guest checkouts
    // and account deletions still leave a complete record.
    customerName?: string;
    customerEmail?: string;
    phone?: string;
    notes?: string;
    items: IOrderItem[];
    shippingAddress: {
        state: string,
        city: string,
        street?: string,
        phone: string,
        name?: string,
    };
    payment: {
        provider: string,
        status: string,
        reference?: string,
        amount: number,
    };
    delivery: {
        provider?: string,
        trackingId?: string,
        status?: string,
        etaDays?: number,
        fee?: number,
    };
    status: string;
    total: number;
    paidAt?: Date;
    deliveredAt?: Date;
    cancelledAt?: Date;
}

const OrderSchema = new Schema<IOrder>({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  customerName: { type: String },
  customerEmail: { type: String },
  phone: { type: String },
  notes: { type: String },
  items: [{
    product: { type: Schema.Types.ObjectId, ref: 'Plant', required: true },
    name: String,
    price: Number,
    qty: Number,
    size: String,
    image: String,
    fragile: Boolean,
  }],
  shippingAddress: {
    state: String, city: String, street: String, phone: String, name: String,
  },
  payment: {
    provider: String,
    status: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid' },
    reference: String,
    amount: Number,
  },
  delivery: {
    provider: String,
    trackingId: String,
    status: { type: String, enum: DELIVERY_STATUSES },
    etaDays: Number,
    fee: Number,
  },
  status: { type: String, enum: ORDER_STATUSES, default: 'pending_payment' },
  total: Number,
  paidAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,
}, { timestamps: true });

OrderSchema.index({ user: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });

export const Order = model<IOrder>('Order', OrderSchema);
