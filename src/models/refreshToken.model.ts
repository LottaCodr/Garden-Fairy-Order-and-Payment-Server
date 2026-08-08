import { Schema, model, Document, Types } from 'mongoose';

export interface IRefreshToken extends Document {
    user: Types.ObjectId;
    tokenHash: string;
    expiresAt: Date;
    revokedAt?: Date;
    replacedByHash?: string;
    createdAt: Date;
}

const RefreshTokenSchema = new Schema<IRefreshToken>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date },
  replacedByHash: { type: String },
}, { timestamps: true });

// Mongo TTL index: documents are removed shortly after they expire.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model<IRefreshToken>(
  'RefreshToken',
  RefreshTokenSchema,
);
