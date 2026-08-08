import { Schema, model, Document, Types } from 'mongoose';

export const PRODUCT_STATUSES = ['active', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export interface IPlantImage {
    url: string;
    publicId: string;
}

export interface IPlant extends Document {
    name: string;
    slug: string;
    sku?: string;
    description: string;
    price: number;
    compareAtPrice?: number;
    category: Types.ObjectId;
    imageUrl: IPlantImage[];
    care: {
        sunlight: string,
        watering: string,
        temperature: string,
    };
    stock: number;
    isPremium: boolean;
    tags: string[];
    sold: number;
    rating: number;
    ratingCount: number;
    status: ProductStatus;
    createdAt: Date;
}

const plantSchema = new Schema<IPlant>(
  {
    name: { type: String, required: true },
    // Unique but sparse so pre-existing documents without slugs are fine.
    slug: { type: String, unique: true, sparse: true, index: true },
    sku: { type: String, unique: true, sparse: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    compareAtPrice: { type: Number },

    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },

    imageUrl: {
      type: [
        {
          url: { type: String, required: true },
          publicId: { type: String, required: true },
        },
      ],
      required: true,
      validate: [
        (arr: unknown[]) => arr.length > 0,
        'At least one image is required',
      ],
    },


    care: {
      sunlight: { type: String, required: true },
      watering: { type: String, required: true },
      temperature: { type: String, required: true },
    },

    stock: { type: Number, default: 1, min: 0 },
    isPremium: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
    sold: { type: Number, default: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    status: { type: String, enum: PRODUCT_STATUSES, default: 'active' },
  },
  { timestamps: true },
);

// Indexes to support catalogue search/filtering
// (name text search, category/tags filters, price range, care.sunlight).
plantSchema.index({ name: 'text', description: 'text', tags: 'text' });
plantSchema.index({ category: 1, price: 1 });
plantSchema.index({ tags: 1 });
plantSchema.index({ 'care.sunlight': 1 });
plantSchema.index({ sold: -1 });
plantSchema.index({ status: 1, createdAt: -1 });
plantSchema.index({ isPremium: 1 });
plantSchema.index({ rating: -1 });

export const Plant = model<IPlant>('Plant', plantSchema);
