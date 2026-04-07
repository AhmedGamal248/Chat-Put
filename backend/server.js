import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import leadRoutes from './routes/lead.js';
import chatRoutes from './routes/mortgageChat.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

connectDB();

app.use(cors());
app.use(express.json());

app.use('/api', leadRoutes);
app.use('/api', chatRoutes);



app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
