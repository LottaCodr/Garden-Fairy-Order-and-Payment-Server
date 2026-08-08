import { Schema, model, Document } from 'mongoose';

export const CONTACT_STATUSES = ['NEW', 'REPLIED', 'CLOSED'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export interface IContactMessage extends Document {
    name: string;
    email: string;
    subject: string;
    message: string;
    status: ContactStatus;
    createdAt: Date;
}

const ContactMessageSchema = new Schema<IContactMessage>({
  name: { type: String, required: true },
  email: { type: String, required: true },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: CONTACT_STATUSES, default: 'NEW' },
}, { timestamps: true });

ContactMessageSchema.index({ status: 1, createdAt: -1 });

export const ContactMessage = model<IContactMessage>(
  'ContactMessage',
  ContactMessageSchema,
);
