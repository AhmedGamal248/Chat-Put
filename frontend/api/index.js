import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from '../server/config/database.js';
import leadRoutes from '../server/routes/lead.js';
import chatRoutes from '../server/routes/mortgageAdvisorChat.js';

dotenv.config();

const app = express();

// CORS configuration for Vercel
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

app.use(express.json());

// Connect to MongoDB (with connection caching for serverless)
let isConnected = false;
async function ensureDBConnection() {
  if (!isConnected) {
    await connectDB();
    isConnected = true;
  }
}

// Middleware to ensure DB connection before handling requests
app.use(async (req, res, next) => {
  try {
    await ensureDBConnection();
    next();
  } catch (error) {
    console.error('DB connection error:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

app.use('/api', leadRoutes);
app.use('/api', chatRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
