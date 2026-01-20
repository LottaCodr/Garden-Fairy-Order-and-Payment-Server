import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "@src/models/user.model";
import { Category } from "@src/models/category.model";
import { Plant } from "@src/models/plant.model";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI!;

const seed = async () => {
    try {
        await mongoose.connect(MONGO_URI);

        console.log("MongoDB Connected")

        //Clear existing data 
        await Promise.all([
            User.deleteMany({}),
            Category.deleteMany({}),
            Plant.deleteMany({})
        ]);

        //create admin User
        const admin = await User.create({
            name: "Super Admin",
            email: "admin@plantstore.ng",
            password: "Admin123!",
            role: "admin"
        });

        console.log("Admin created");
        const categories = await Category.insertMany([
            { name: "Indoor Plants", slug: "indoor", description: "Perfect for indoor spaces" },
            { name: "Outdoor Plants", slug: "outdoor", description: "Garden and outdoor plants" },
            { name: "Succulents", slug: "succulents", description: "Low-maintenance plants" },
            { name: "Flowering Plants", slug: "flowering", description: "Beautiful flowering plants" }
        ]);

        console.log("Categories seeded")

        //sample plants
        await Plant.insertMany([
            {
                name: "Snake Plant",
                description: "Air-purifying indoor plant",
                price: 4500,
                stock: 20,
                category: categories[0]._id,
                images: [
                    "https://res.cloudinary.com/demo/image/upload/snake.jpg"
                ],
                care: {
                    sunlight: "low",
                    watering: "weekly"
                },
                tags: ["pet-friendly"]
            },
            {
                name: "Peace Lily",
                description: "Flowering indoor plant",
                price: 6500,
                stock: 15,
                category: categories[3]._id,
                images: [
                    "https://res.cloudinary.com/demo/image/upload/lily.jpg"
                ],
                care: {
                    sunlight: "medium",
                    watering: "twice-weekly"
                }
            }
        ])

        console.log("plants seeded")
        process.exit(0);
    } catch (error) {
        console.error("Seeding failed", error)

    }
};

seed()