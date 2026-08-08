import { Schema, model, Document } from 'mongoose';

export interface INewsletterSubscriber extends Document {
    email: string;
    subscribedAt: Date;
    unsubscribedAt?: Date;
}

const NewsletterSubscriberSchema = new Schema<INewsletterSubscriber>({
  email: { type: String, required: true, unique: true, lowercase: true },
  subscribedAt: { type: Date, default: () => new Date() },
  unsubscribedAt: { type: Date },
});

export const NewsletterSubscriber = model<INewsletterSubscriber>(
  'NewsletterSubscriber',
  NewsletterSubscriberSchema,
);
