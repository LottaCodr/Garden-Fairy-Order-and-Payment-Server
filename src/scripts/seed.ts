import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '@src/models/user.model';
import { Category } from '@src/models/category.model';
import { Plant } from '@src/models/plant.model';
import { DeliveryRate } from '@src/models/deliveryRate.model';
import { StoreSetting } from '@src/models/storeSetting.model';
import { DEFAULT_SETTINGS } from '@src/services/settings.service';

dotenv.config();

// eslint-disable-next-line n/no-process-env
const MONGO_URI = process.env.MONGO_URI!;

const seed = async () => {
  try {
    await mongoose.connect(MONGO_URI);

    console.log('MongoDB Connected');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      Plant.deleteMany({}),
      DeliveryRate.deleteMany({}),
      StoreSetting.deleteMany({}),
    ]);

    // create admin User
    await User.create({
      name: 'Super Admin',
      email: 'admin@plantstore.ng',
      password: 'Admin123!',
      role: 'admin',
    });

    console.log('Admin created');

    const categories = await Category.insertMany([
      { name: 'Indoor Plants', slug: 'indoor', icon: 'leaf', description: 'Perfect for indoor spaces' },
      { name: 'Outdoor Plants', slug: 'outdoor', icon: 'tree-pine', description: 'Garden and outdoor plants' },
      { name: 'Succulents', slug: 'succulents', icon: 'flower-2', description: 'Low-maintenance plants' },
      { name: 'Flowering Plants', slug: 'flowering', icon: 'flower', description: 'Beautiful flowering plants' },
    ]);

    console.log('Categories seeded');

    // sample plants
    await Plant.insertMany([
      {
        name: 'Snake Plant',
        slug: 'snake-plant',
        sku: 'GF-SNAKE-001',
        description: 'Air-purifying indoor plant',
        price: 4500,
        stock: 20,
        status: 'active',
        category: categories[0]._id,

        imageUrl: [
          { url: 'https://res.cloudinary.com/demo/image/upload/snake1.jpg', publicId: 'snake1' },
          { url: 'https://res.cloudinary.com/demo/image/upload/snake2.jpg', publicId: 'snake2' },
        ],

        care: {
          sunlight: 'low',
          watering: 'weekly',
          temperature: '18–30°C',
        },

        tags: ['pet-friendly'],
      },
      {
        name: 'Peace Lily',
        slug: 'peace-lily',
        sku: 'GF-PEACE-002',
        description: 'Flowering indoor plant',
        price: 6500,
        compareAtPrice: 8000,
        stock: 15,
        status: 'active',
        category: categories[3]._id,

        imageUrl: [
          { url: 'https://res.cloudinary.com/demo/image/upload/snake1.jpg', publicId: 'snake1' },
          { url: 'https://res.cloudinary.com/demo/image/upload/snake2.jpg', publicId: 'snake2' },
        ],

        care: {
          sunlight: 'medium',
          watering: 'twice-weekly',
          temperature: '20–28°C',
        },
      },
    ]);

    console.log('Plants seeded');

    // Delivery rates — the checkout estimate table (₦ + ETA days).
    await DeliveryRate.insertMany([
      { state: 'Lagos', fee: 3500, etaDays: 2 },
      { state: 'Abuja', area: 'FCT', fee: 4000, etaDays: 3 },
      { state: 'Rivers', area: 'Port Harcourt', fee: 4500, etaDays: 4 },
      { state: 'Oyo', area: 'Ibadan', fee: 4000, etaDays: 3 },
    ]);

    console.log('Delivery rates seeded');

    // Store settings — defaults persisted explicitly so admins can edit.
    await StoreSetting.insertMany(
      Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })),
    );

    console.log('Store settings seeded');

    // eslint-disable-next-line n/no-process-exit
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed', error);
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  }
};

seed();
