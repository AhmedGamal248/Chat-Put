import express from 'express';
import Lead from '../models/Lead.js';
import Session from '../models/Session.js';
import { getChatResponse, extractPhone } from '../services/mortgageFlowService.js';

const router = express.Router();

const RESPONSE_BUDGET_MS = 4500;
const ALLOWED_STAGES = new Set([
  'collect_name',
  'collect_marital_status',
  'collect_income',
  'collect_obligations',
  'collect_property_price',
  'collect_down_payment',
  'collect_phone',
  'lead_saved'
]);

const EMPTY_SESSION_DATA = {
  name: null,
  maritalStatus: null,
  income: null,
  obligations: null,
  downPayment: null,
  propertyValue: null,
  phone: null
};

const PROPERTY_CARD_TEMPLATES = [
  {
    id: 'new-cairo-apartment',
    title: 'شقة في القاهرة الجديدة',
    image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=900&q=80'
  },
  {
    id: 'october-apartment',
    title: 'شقة في 6 أكتوبر',
    image: 'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=900&q=80'
  }
];

function formatMoney(value) {
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat('ar-EG').format(Math.round(value));
}

function getFirstName(name = '') {
  return String(name || '').trim().split(' ')[0] || 'حضرتك';
}

function roundToNearest(value, step = 50_000) {
  if (!Number.isFinite(value) || value <= 0) {
    return step;
  }

  return Math.max(step, Math.round(value / step) * step);
}

function buildSuggestedCards(data = {}) {
  let basePrice = Number.isFinite(data.propertyValue) ? data.propertyValue : null;

  if (!Number.isFinite(basePrice) && Number.isFinite(data.income)) {
    basePrice = data.income * 35;
  }

  if (!Number.isFinite(basePrice) && Number.isFinite(data.downPayment)) {
    basePrice = Math.max(data.downPayment * 3.5, 1_000_000);
  }

  if (!Number.isFinite(basePrice)) {
    basePrice = 1_800_000;
  }

  const priceVariants = [0.96, 1.08];

  return PROPERTY_CARD_TEMPLATES.map((card, index) => {
    const price = roundToNearest(basePrice * priceVariants[index]);

    return {
      id: card.id,
      title: card.title,
      image: card.image,
      price,
      priceLabel: `${formatMoney(price)} جنيه`
    };
  });
}

function buildJsonResponse({ reply, intent, next_step, cta, images = [] }) {
  const cleanReply = String(reply || '').trim();
  const cleanCta = String(cta || '').trim();

  return {
    reply: cleanReply.endsWith(cleanCta) ? cleanReply : `${cleanReply}\n${cleanCta}`.trim(),
    intent,
    next_step,
    cta: cleanCta,
    images
  };
}

function resolveFallbackStep(data = {}) {
  if (!data.name) return 'collect_name';
  if (!data.maritalStatus) return 'collect_marital_status';
  if (!Number.isFinite(data.income)) return 'collect_income';
  if (!Number.isFinite(data.obligations)) return 'collect_obligations';
  if (!Number.isFinite(data.propertyValue)) return 'collect_property_price';
  if (!Number.isFinite(data.downPayment)) return 'collect_down_payment';
  if (!data.phone) return 'collect_phone';
  return 'lead_saved';
}

function buildTimeoutFallback(data = {}) {
  const step = resolveFallbackStep(data);

  if (step === 'collect_name') {
    return buildJsonResponse({
      reply: 'ممكن أعرف اسم حضرتك؟',
      intent: 'mortgage_info',
      next_step: 'collect_name',
      cta: 'اكتب اسم حضرتك ونكمل 👇'
    });
  }

  if (step === 'collect_marital_status') {
    return buildJsonResponse({
      reply: `أهلاً يا ${getFirstName(data.name)} 👋 نورتنا!\nتحب أعرف حالتك الاجتماعية؟ (أعزب / متزوج)`,
      intent: 'mortgage_info',
      next_step: 'collect_marital_status',
      cta: 'اكتب أعزب أو متزوج 👇'
    });
  }

  if (step === 'collect_income') {
    return buildJsonResponse({
      reply: `تمام يا ${getFirstName(data.name)}.\nممكن أعرف صافي دخلك الشهري؟`,
      intent: 'mortgage_info',
      next_step: 'collect_income',
      cta: 'اكتب صافي الدخل الشهري بالجنيه 👇'
    });
  }

  if (step === 'collect_obligations') {
    return buildJsonResponse({
      reply: `صافي دخلك المسجل ${formatMoney(data.income)} جنيه.\nهل لديك التزامات أو أقساط حالية؟`,
      intent: 'mortgage_info',
      next_step: 'collect_obligations',
      cta: 'اكتب قيمة الالتزامات الشهرية أو 0 لو مفيش 👇'
    });
  }

  if (step === 'collect_property_price') {
    return buildJsonResponse({
      reply: 'تمام.\nما سعر الوحدة السكنية المتوقع؟',
      intent: 'mortgage_info',
      next_step: 'collect_property_price',
      cta: 'اكتب سعر الوحدة المتوقع 👇'
    });
  }

  if (step === 'collect_down_payment') {
    const minDownPayment = Math.round((data.propertyValue || 0) * 0.05);
    const maxDownPayment = Math.round((data.propertyValue || 0) * 0.2);
    return buildJsonResponse({
      reply: `سعر الوحدة المسجل ${formatMoney(data.propertyValue)} جنيه.\nما قيمة المقدم؟ (بين 5% و20% من سعر الوحدة)`,
      intent: 'mortgage_info',
      next_step: 'collect_down_payment',
      cta: `اكتب المقدم بين ${formatMoney(minDownPayment)} و${formatMoney(maxDownPayment)} جنيه 👇`
    });
  }

  return buildJsonResponse({
    reply: 'البيانات الأساسية عندنا جاهزة تقريباً.\nفاضل رقم الموبايل فقط عشان نكمل الطلب ونرشح وحدات مناسبة.',
    intent: 'lead_capture',
    next_step: 'collect_phone',
    cta: 'سيب رقم موبايلك ونكمل 👇'
  });
}

async function saveLeadRecord(data, sessionId, intent) {
  const phone = extractPhone(data.phone || '');

  if (!phone) {
    return;
  }

  let lead = await Lead.findOne({ phone });

  if (!lead) {
    lead = new Lead({
      name: data.name || 'بدون اسم',
      phone
    });
  }

  lead.name = data.name || lead.name;
  lead.sessionId = sessionId;
  lead.intent = intent || 'lead_capture';
  lead.maritalStatus = data.maritalStatus || lead.maritalStatus;

  if (Number.isFinite(data.income)) lead.income = data.income;
  if (Number.isFinite(data.obligations)) lead.obligations = data.obligations;
  if (Number.isFinite(data.downPayment)) lead.downPayment = data.downPayment;
  if (Number.isFinite(data.propertyValue)) lead.propertyValue = data.propertyValue;

  await lead.save();
}

router.post('/chat', async (req, res) => {
  try {
    const {
      text = '',
      sessionId = 'default',
      stageHint = '',
      clientData = {}
    } = req.body;
    const textValue = String(text || '').trim();
    const lower = textValue.toLowerCase();

    let session = await Session.findOneAndUpdate(
      { sessionId },
      {
        $setOnInsert: {
          sessionId,
          stage: 'collect_name',
          data: { ...EMPTY_SESSION_DATA },
          messages: []
        }
      },
      { upsert: true, new: true }
    );

    session.messages = Array.isArray(session.messages) ? session.messages : [];
    session.data = session.data || { ...EMPTY_SESSION_DATA };

    const normalizedStageHint = ALLOWED_STAGES.has(stageHint) ? stageHint : null;
    if (clientData && typeof clientData === 'object') {
      const safeName = typeof clientData.name === 'string' ? clientData.name.trim() : '';
      if (safeName && !session.data.name) {
        session.data.name = safeName;
      }
    }
    if (normalizedStageHint && session.stage === 'collect_name' && session.data?.name) {
      session.stage = normalizedStageHint;
    }

    if (lower === 'back') {
      session.messages = session.messages.slice(0, -2);
      await session.save();

      return res.json(
        buildJsonResponse({
          reply: 'رجعنا خطوة للخلف.\nابعت الرد الصح أو كمل من النقطة اللي تناسبك.',
          intent: 'mortgage_info',
          next_step: session.stage || 'collect_name',
          cta: 'كمل من الخطوة اللي تحبها 👇'
        })
      );
    }

    if (lower === 'restart') {
      Object.assign(session, {
        stage: 'collect_name',
        data: { ...EMPTY_SESSION_DATA },
        messages: []
      });
      await session.save();

      return res.json(
        buildJsonResponse({
          reply: 'بدأنا من جديد.\nممكن أعرف اسم حضرتك؟',
          intent: 'mortgage_info',
          next_step: 'collect_name',
          cta: 'اكتب اسم حضرتك ونبدأ 👇'
        })
      );
    }

    let aiResponse;

    try {
      aiResponse = await Promise.race([
        getChatResponse({
          userMessage: textValue,
          conversationHistory: session.messages,
          sessionData: session.data,
          stage: normalizedStageHint || session.stage || 'collect_name'
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), RESPONSE_BUDGET_MS)
        )
      ]);
    } catch (error) {
      console.error('Chat timeout/error:', error.message);
      aiResponse = {
        ...buildTimeoutFallback(session.data),
        dataCaptured: {}
      };
    }

    const captured = aiResponse.dataCaptured || {};
    const hadPhoneBefore = Boolean(session.data?.phone);
    const updatedData = {
      name: captured.name ?? session.data.name ?? null,
      maritalStatus: captured.maritalStatus ?? session.data.maritalStatus ?? null,
      income: captured.income ?? session.data.income ?? null,
      obligations: captured.obligations ?? session.data.obligations ?? null,
      downPayment: captured.downPayment ?? session.data.downPayment ?? null,
      propertyValue: captured.propertyValue ?? session.data.propertyValue ?? null,
      phone: captured.phone ?? session.data.phone ?? null
    };

    const nextStep = aiResponse.next_step || session.stage || 'collect_name';
    const shouldShowPropertyCards =
      nextStep === 'collect_phone' || (!hadPhoneBefore && Boolean(updatedData.phone));
    const finalResponse = buildJsonResponse({
      reply: aiResponse.reply,
      intent: aiResponse.intent,
      next_step: nextStep,
      cta: aiResponse.cta,
      images: shouldShowPropertyCards ? buildSuggestedCards(updatedData) : []
    });

    const updatedMessages = [
      ...session.messages,
      { sender: 'user', text: textValue, timestamp: new Date() },
      { sender: 'bot', text: finalResponse.reply, timestamp: new Date() }
    ];

    void Promise.allSettled([
      updatedData.phone
        ? saveLeadRecord(updatedData, sessionId, aiResponse.intent)
        : Promise.resolve(),
      Session.findOneAndUpdate(
        { sessionId },
        {
          data: updatedData,
          messages: updatedMessages,
          stage: updatedData.phone ? 'lead_saved' : finalResponse.next_step,
          updatedAt: new Date()
        },
        { new: true }
      )
    ]).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected') {
          console.error('Persistence error:', result.reason?.message || result.reason);
        }
      }
    });

    return res.json(finalResponse);
  } catch (error) {
    console.error('Error in chat:', error);
    return res.status(500).json({
      error: 'حدث خطأ في المعالجة',
      details: error.message
    });
  }
});

export default router;
