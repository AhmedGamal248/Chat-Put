import express from 'express';
import Lead from '../models/Lead.js';
import Session from '../models/Session.js';
import { getChatResponse, extractPhone } from '../services/aiService.js';

const router = express.Router();

const RESPONSE_BUDGET_MS = 4500;

const EMPTY_SESSION_DATA = { phone: null, income: null, propertyValue: null, downPayment: null, propertyLegalStatus: null };


async function saveLeadRecord(data, sessionId, intent) {
  const phone = extractPhone(data.phone || '');
  if (!phone) return;

  const lead = await Lead.findOne({ phone }) || new Lead({ name: 'بدون اسم', phone });

  lead.sessionId = sessionId;
  lead.intent    = intent || 'lead_capture';

  if (Number.isFinite(data.income))         lead.income         = data.income;
  if (Number.isFinite(data.propertyValue))  lead.propertyValue  = data.propertyValue;
  if (Number.isFinite(data.downPayment))    lead.downPayment    = data.downPayment;
  if (data.propertyLegalStatus)             lead.propertyLegalStatus = data.propertyLegalStatus;

  await lead.save();
}

// ── Fallback لو انتهى الـ timeout ────────────────────────────────
function buildTimeoutFallback(data = {}) {
  const steps = [
    [!data.income,         'collect_income',         'ابعت صافي دخلك الشهري الآن ونكمل الطلب فوراً ',        '- نحتاج أولاً صافي الدخل الشهري حتى نحدد الأهلية والقسط المناسب.'],
    [!data.propertyValue,  'collect_property_price', 'ابعت سعر الوحدة أو الميزانية التقريبية ونكمل الطلب ',  '- الخطوة التالية هي سعر الوحدة أو الميزانية المستهدفة.'],
    [!data.downPayment,    'collect_down_payment',   'ابعت قيمة المقدم المتاح معاك ونكمل الطلب ',           '- نحتاج فقط قيمة المقدم المتاح معك.'],
  ];

  for (const [condition, next_step, cta, line] of steps) {
    if (condition) return { reply: `- هكمل معك بسرعة.\n${line}\n${cta}`, intent: 'mortgage_info', next_step, cta };
  }

  const cta = 'سيب رقمك الآن ونبدأ المتابعة على المنصة ';
  return { reply: `- التقييم المبدئي جاهز تقريباً.\n- نحتاج رقم الهاتف فقط لتسجيل الطلب.\n${cta}`, intent: 'lead_capture', next_step: 'collect_phone', cta };
}

router.post('/chat', async (req, res) => {
  try {
    const { text = '', sessionId = 'default' } = req.body;
    const textValue = String(text).trim();
    const lower     = textValue.toLowerCase();

    let session = await Session.findOneAndUpdate(
      { sessionId },
      { $setOnInsert: { sessionId, stage: 'welcome', data: { ...EMPTY_SESSION_DATA }, messages: [] } },
      { upsert: true, new: true }
    );

    session.messages = Array.isArray(session.messages) ? session.messages : [];
    session.data     = session.data || { ...EMPTY_SESSION_DATA };

    // ── أوامر خاصة ────────────────────────────────────────────────
    if (lower === 'back') {
      session.messages = session.messages.slice(0, -2);
      await session.save();
      return res.json({
        reply: '- رجعنا خطوة للخلف.\n- ابعت المعلومة الصحيحة أو السؤال اللي تحب نكمل منه.\nاكمل من النقطة اللي تناسبك ',
        intent: 'mortgage_info', next_step: session.stage || 'welcome',
        cta: 'اكمل من النقطة اللي تناسبك ',
      });
    }

    if (lower === 'restart') {
      Object.assign(session, { stage: 'welcome', data: { ...EMPTY_SESSION_DATA }, messages: [] });
      await session.save();
      return res.json({
        reply: '- بدأنا من جديد.\n- هساعدك نفهم الأهلية والمقدم والقسط والمستندات المطلوبة.\nابعت صافي دخلك الشهري أو ميزانية الوحدة ونبدأ فوراً ',
        intent: 'mortgage_info', next_step: 'collect_income',
        cta: 'ابعت صافي دخلك الشهري أو ميزانية الوحدة ونبدأ فوراً ',
      });
    }

    // ── استدعاء الـ AI مع timeout ─────────────────────────────────
    let aiResponse;
    try {
      aiResponse = await Promise.race([
        getChatResponse({ userMessage: textValue, conversationHistory: session.messages, sessionData: session.data, stage: session.stage }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), RESPONSE_BUDGET_MS)),
      ]);
    } catch (err) {
      console.error('Chat timeout/error:', err.message);
      aiResponse = { ...buildTimeoutFallback(session.data), dataCaptured: {} };
    }

    // ── دمج البيانات ──────────────────────────────────────────────
    const captured = aiResponse.dataCaptured || {};
    const updatedData = {
      phone              : captured.phone               ?? session.data.phone               ?? null,
      income             : captured.income              ?? session.data.income              ?? null,
      propertyValue      : captured.propertyValue       ?? session.data.propertyValue       ?? null,
      downPayment        : captured.downPayment         ?? session.data.downPayment         ?? null,
      propertyLegalStatus: captured.propertyLegalStatus ?? session.data.propertyLegalStatus ?? null,
    };

    const finalResponse = {
      reply    : String(aiResponse.reply || '').trim(),
      intent   : aiResponse.intent,
      next_step: aiResponse.next_step || session.stage,
      cta      : String(aiResponse.cta || '').trim(),
    };

    // ── حفظ غير متزامن ───────────────────────────────────────────
    const updatedMessages = [
      ...session.messages,
      { sender: 'user', text: textValue,           timestamp: new Date() },
      { sender: 'bot',  text: finalResponse.reply, timestamp: new Date() },
    ];

    void Promise.allSettled([
      updatedData.phone ? saveLeadRecord(updatedData, sessionId, aiResponse.intent) : Promise.resolve(),
      Session.findOneAndUpdate(
        { sessionId },
        { data: updatedData, messages: updatedMessages, stage: updatedData.phone ? 'lead_saved' : finalResponse.next_step, updatedAt: new Date() },
        { new: true }
      ),
    ]).then(results => {
      for (const r of results) {
        if (r.status === 'rejected') console.error('Persistence error:', r.reason?.message);
      }
    });

    return res.json(finalResponse);

  } catch (error) {
    console.error('Error in chat:', error);
    return res.status(500).json({ error: 'حدث خطأ في المعالجة', details: error.message });
  }
});

export default router;
