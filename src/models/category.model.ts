import { Schema, model, Document } from 'mongoose';

export interface ICategory extends Document {
    name: string;
    slug: string;
    description?: string;
    icon?: string;
}

const CategorySchema = new Schema<ICategory>({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  description: String,
  icon: String, // lucide icon name used by the storefront chips
}, { timestamps: true });

export const Category = model<ICategory>('Category', CategorySchema);
