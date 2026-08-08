import { Schema, model, Document } from 'mongoose';

export const NOTIFICATION_TYPES = [
  'NEW_ORDER',
  'LOW_STOCK',
  'ORDER_STATUS',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface IAdminNotification extends Document {
    type: NotificationType;
    title: string;
    payload: Record<string, unknown>;
    readAt?: Date;
    createdAt: Date;
}

const AdminNotificationSchema = new Schema<IAdminNotification>({
  type: { type: String, enum: NOTIFICATION_TYPES, required: true },
  title: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, default: {} },
  readAt: { type: Date },
}, { timestamps: true });

AdminNotificationSchema.index({ readAt: 1, createdAt: -1 });

export const AdminNotification = model<IAdminNotification>(
  'AdminNotification',
  AdminNotificationSchema,
);
