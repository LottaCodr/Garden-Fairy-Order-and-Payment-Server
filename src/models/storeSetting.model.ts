import { Schema, model, Document } from 'mongoose';

export interface IStoreSetting extends Document {
    key: string;
    value: unknown;
}

const StoreSettingSchema = new Schema<IStoreSetting>({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed },
});

export const StoreSetting = model<IStoreSetting>(
  'StoreSetting',
  StoreSettingSchema,
);
