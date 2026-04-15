import express from 'express';
import Lead from '../models/Lead.js';
import { extractPhone } from '../services/mortgageFlowService.js';

const router = express.Router();

router.post('/lead', async (req, res) => {
  try {
    const {name, phone, maritalStatus, income, obligations, propertyValue, downPayment, intent, sessionId } = req.body;

    const normalizedPhone = extractPhone(phone || '');
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Valid Egyptian phone number is required' });
    }

    const lead   = await Lead.findOne({ phone: normalizedPhone }) || new Lead({ name: name || 'بدون اسم', phone: normalizedPhone });
    const created = !lead._id;

    if (name) lead.name = name;
    if (sessionId) lead.sessionId = sessionId;
    if (intent) lead.intent = intent;
    if (maritalStatus) lead.maritalStatus = maritalStatus;

    const parsedIncome = Number(income);
    const parsedObligations = Number(obligations);
    const parsedPropertyValue = Number(propertyValue);
    const parsedDownPayment = Number(downPayment);

    if (Number.isFinite(parsedIncome)) lead.income = parsedIncome;
    if (Number.isFinite(parsedObligations)) lead.obligations = parsedObligations;
    if (Number.isFinite(parsedPropertyValue)) lead.propertyValue = parsedPropertyValue;
    if (Number.isFinite(parsedDownPayment)) lead.downPayment = parsedDownPayment;

    await lead.save();
    return res.status(created ? 201 : 200).json({ message: created ? 'Lead saved' : 'Lead updated', lead });

  } catch (error) {
    console.error('Error saving lead:', error);
    return res.status(500).json({ error: 'Failed to save lead' });
  }
});

export default router;
