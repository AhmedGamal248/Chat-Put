import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Connection caching for serverless environments (Vercel)
// Prevents creating a new connection on every request
let cached = global._mongooseCache;
if (!cached) {
  cached = global._mongooseCache = { conn: null, promise: null };
}

export default async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGO_ATLAS_URI, {
      bufferCommands: false,
    }).then((m) => {
      console.log('Connected to MongoDB');
      return m;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    console.error('MongoDB connection error:', error);
    throw error;
  }

  return cached.conn;
}

