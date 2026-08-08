import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI!);
    console.log(`📦 MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ DB Connection Failed', error);
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  }
};
