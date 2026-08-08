import { Schema, model, Document, Types } from 'mongoose';

export interface IPlantImage {
    url: string;
    publicId: string;
}

export interface IPlant extends Document {
    name: string;
    description: string;
    price: number;
    category: Types.ObjectId;
    imageUrl: IPlantImage[];
    care: {
        sunlight: string,
        watering: string,
        temperature: string,
    };
    stock: number;
    tags: string[];
    sold: number;
    createdAt: Date;
}

const plantSchema = new Schema<IPlant>(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },

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

    stock: { type: Number, default: 1 },
    tags: { type: [String], default: [] },
    sold: { type: Number, default: 0 },
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

export const Plant = model<IPlant>('Plant', plantSchema);
