import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import leadRoutes from './routes/lead.js';
import chatRoutes from './routes/mortgageAdvisorChat.js';
import path from "path";
import { fileURLToPath } from "url";


dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

connectDB();

app.use(cors());
app.use(express.json());

app.use('/api', leadRoutes);
app.use('/api', chatRoutes);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// مهم جدًا 👇
app.use(express.static(path.join(__dirname, "public")));

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0",() => {
  console.log(`Server running on port ${PORT}`);
});
