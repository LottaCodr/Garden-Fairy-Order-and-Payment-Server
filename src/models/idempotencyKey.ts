import { Schema, model, Document } from "mongoose";

export interface IIdempotencyKey extends Document {
    key: string;
    endpoint: string;
    response: any;
    createdAt: Date;
}

const IdempotencyKeySchema = new Schema<IIdempotencyKey>({
    key: { type: String, required: true, unique: true },
    endpoint: { type: String, required: true },
    response: { type: Schema.Types.Mixed }
}, {
    timestamps: true
});

export const IdempotencyKey = model<IIdempotencyKey>(
    "IdempotencyKey",
    IdempotencyKeySchema
)