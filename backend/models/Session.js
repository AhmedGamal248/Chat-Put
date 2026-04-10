import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  stage: { type: String, default: 'collect_name' },
  data: {
    name: { type: String, default: null },
    maritalStatus: { type: String, default: null },
    phone: { type: String, default: null },
    income: { type: Number, default: null },
    obligations: { type: Number, default: null },
    propertyValue: { type: Number, default: null },
    downPayment: { type: Number, default: null }
  },
  messages: [{
    sender: { type: String, enum: ['user', 'bot'], required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Session = mongoose.model('Session', sessionSchema);

export default Session;
