import { Schema, model, Document } from 'mongoose';

export interface IIdempotencyKey extends Document {
    key: string;
    endpoint: string;
    statusCode: number;
    response: unknown;
    createdAt: Date;
}

const IdempotencyKeySchema = new Schema<IIdempotencyKey>({
  key: { type: String, required: true, unique: true },
  endpoint: { type: String, required: true },
  statusCode: { type: Number, default: 200 },
  response: { type: Schema.Types.Mixed },
}, {
  timestamps: true,
});

export const IdempotencyKey = model<IIdempotencyKey>(
  'IdempotencyKey',
  IdempotencyKeySchema,
);
