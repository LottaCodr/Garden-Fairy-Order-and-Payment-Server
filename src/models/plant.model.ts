import { Schema, model, Document } from "mongoose";

export interface IPlant extends Document {
    name: string;
    description: string;
    price: number;
    category: string;
    imageUrl: string;
    care: {
        sunlight: string;
        watering: string;
        temperature: string;
    };
    stock: number;
    createdAt: Date;
}

const plantSchema = new Schema<IPlant>(
    {
        name: { type: String, required: true },
        description: { type: String, required: true },
        price: { type: Number, required: true },
        category: { type: String, required: true },
        imageUrl: { type: String, required: true },
        care: {
            sunlight: { type: String, required: true },
            watering: { type: String, required: true },
            temperature: { type: String, required: true },
        },
        stock: { type: Number, default: 1 },
    },
    { timestamps: true }
);

export const Plant = model<IPlant>("Plant", plantSchema);
