import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema({
  name: { type: String, default: 'بدون اسم' },
  phone: { type: String, required: true, unique: true },
  income: { type: Number, default: null },
  propertyValue: { type: Number, default: null },
  downPayment: { type: Number, default: null },
  propertyLegalStatus: { type: String, default: null },
  intent: { type: String, default: 'lead_capture' },
  sessionId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

const Lead = mongoose.model('Lead', leadSchema);

export default Lead;
