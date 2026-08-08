import { Schema, model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IAddress {
    _id?: Types.ObjectId;
    label?: string;
    street: string;
    city: string;
    state: string;
    isDefault: boolean;
}

export interface IUser extends Document {
    name: string;
    email: string;
    phone?: string;
    avatarUrl?: string;
    password: string;
    role: 'customer' | 'admin';
    addresses: IAddress[];
    comparePassword(candidate: string): Promise<boolean>;
}

const AddressSchema = new Schema<IAddress>({
  label: { type: String },
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
}, { _id: true });

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String },
  avatarUrl: { type: String },
  password: { type: String, required: true },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
  addresses: { type: [AddressSchema], default: [] },
}, { timestamps: true });

UserSchema.pre<IUser>('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

export const User = model<IUser>('User', UserSchema);
