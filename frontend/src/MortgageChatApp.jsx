import { useEffect, useRef, useState } from 'react';
import './App.css';

// ─── الرسالة الافتتاحية ───────────────────────────────────────────────────────
const INITIAL_MESSAGE = {
  id: 'welcome-message',
  sender: 'bot',
  intent: 'mortgage_info',
  nextStep: 'collect_name',
  text: ' أهلا بيك مع مستشارك العقاري! 👋\nممكن أعرف اسم حضرتك؟',
  cta: 'اكتب اسمك ونبدأ خطوة خطوة 👇',
  images: [],
  quickReplies: []
};

// ─── الأزرار السريعة حسب المرحلة ─────────────────────────────────────────────
const QUICK_ACTIONS = {
  collect_name: [],
  select_intent: [
    'مستشارك العقاري الذكي',
    'الدليل التنظيمي للتمويل العقاري وشروط البنك المركزي',
    'المستشار القانوني العقاري'
  ],
  select_conditions_type: [
    'شروط الوحدة السكنية',
    'شروط الشخص نفسه'
  ],
  collect_marital_status: [],
  collect_income: [],
  collect_obligations: [],
  collect_down_payment: [],
  collect_property_price: [],
  collect_phone: [],
  lead_saved: [],
  violations_redirect: [],
  show_unit_conditions: [],
  show_person_conditions: [],
  default: []
};

const PLACEHOLDERS = {
  collect_name: 'مثال: أحمد جمال',
  select_intent: 'أو اكتب سؤالك هنا',
  select_conditions_type: 'اختر من الأزرار فوق',
  collect_marital_status: 'اكتب: أعزب أو متزوج',
  collect_income: 'مثال: 15,000',
  collect_obligations: 'مثال: 0 أو 2500',
  collect_property_price: 'مثال: 1,000,000',
  collect_down_payment: 'مثال: 120,000',
  collect_phone: 'مثال: 011 *******',
  lead_saved: '',
  violations_redirect: '',
  show_unit_conditions: '',
  show_person_conditions: '',
  default: 'اكتب ردك هنا'
};

const STEP_TITLES = {
  collect_name: 'بيانات أساسية',
  select_intent: 'اختر الخدمة',
  select_conditions_type: 'نوع الشروط',
  collect_marital_status: 'الحالة الاجتماعية',
  collect_income: 'الدخل الشهري',
  collect_obligations: 'الالتزامات الحالية',
  collect_property_price: 'سعر الوحدة',
  collect_down_payment: 'المقدم',
  collect_phone: 'التواصل',
  lead_saved: 'تم تسجيل طلبك ✅',
  violations_redirect: 'المخالفات',
  show_unit_conditions: 'شروط الوحدة',
  show_person_conditions: 'شروط الشخص',
  default: 'الخطوة الحالية'
};

const NUMERIC_STEPS = new Set([
  'collect_income',
  'collect_obligations',
  'collect_property_price',
  'collect_down_payment'
]);

// ─── شروط الوحدة السكنية ─────────────────────────────────────────────────────
const UNIT_CONDITIONS_TEXT = `شروط الوحدة السكنية للحصول على تمويل عقاري:

1️⃣ الوحدة مسجلة رسمياً أو قابلة للتسجيل في الشهر العقاري.
2️⃣ الوحدة مكتملة البناء أو في مرحلة متقدمة من التشطيب.
3️⃣ سعر الوحدة يتراوح بين 200,000 و2,000,000 جنيه (حسب المبادرة).
4️⃣ الوحدة خالية من أي نزاعات أو رهون قائمة.
5️⃣ الوحدة للسكن الأول فقط (لا تُقبل وحدات الاستثمار أو الإيجار).
6️⃣ مساحة الوحدة لا تقل عن 40 م² ولا تزيد عن 200 م².`;

// ─── شروط الشخص ──────────────────────────────────────────────────────────────
const PERSON_CONDITIONS_TEXT = `شروط الشخص للحصول على تمويل عقاري:

1️⃣ السن من 21 إلى 60 سنة (للموظفين) أو حتى 65 (لأصحاب الأعمال).
2️⃣ الجنسية مصرية أو إقامة سارية للأجانب.
3️⃣ صافي الدخل الشهري:
   • أعزب: لا يتجاوز 13,000 جنيه (مبادرة 8%) أو 40,000 (مبادرة 12%)
   • متزوج: لا يتجاوز 18,000 جنيه (مبادرة 8%) أو 50,000 (مبادرة 12%)
4️⃣ لا يمتلك الشخص وحدة سكنية مُمَوَّلة من قبل.
5️⃣ سجل ائتماني نظيف بدون توقفات أو متأخرات.
6️⃣ خدمة في العمل لا تقل عن 6 أشهر (للموظفين).`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function createMessage({ sender, text, cta = '', intent = 'mortgage_info', nextStep = 'collect_name', images = [], quickReplies = [] }) {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${sender}-${Date.now()}-${Math.random()}`,
    sender, text, cta, intent, nextStep, images, quickReplies
  };
}

function renderMessageLines(text) {
  return String(text || '').split('\n').filter(Boolean);
}

function normalizePropertyCards(images = []) {
  return images.map((item, index) => {
    if (!item) return null;
    if (typeof item === 'string') {
      return { id: `image-${index}`, title: `وحدة مقترحة ${index + 1}`, image: item, priceLabel: '' };
    }
    return {
      id: item.id || `image-${index}`,
      title: item.title || `وحدة مقترحة ${index + 1}`,
      image: item.image || item.imageUrl || '',
      priceLabel: item.priceLabel || item.price || ''
    };
  }).filter(item => item?.image);
}

function getFirstName(name = '') {
  return String(name || '').trim().split(' ')[0] || 'حضرتك';
}

function getHomePageUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '/';
}

// ─── المكوّن الرئيسي ──────────────────────────────────────────────────────────
function MortgageChatApp() {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionId] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  );
  // حالة الجلسة المحلية
  const [localSession, setLocalSession] = useState({
    stage: 'collect_name',
    name: null,
    intent: null   // 'prices' | 'conditions' | 'violations'
  });

  const messagesEndRef = useRef(null);

  const lastBotMessage = [...messages].reverse().find(m => m.sender === 'bot') || INITIAL_MESSAGE;
  const currentStep = lastBotMessage.nextStep;
  const quickActions = QUICK_ACTIONS[currentStep] || QUICK_ACTIONS.default;
  const placeholder = PLACEHOLDERS[currentStep] || PLACEHOLDERS.default;
  const stepTitle = STEP_TITLES[currentStep] || STEP_TITLES.default;
  const inputMode = currentStep === 'collect_phone' ? 'tel'
    : NUMERIC_STEPS.has(currentStep) ? 'numeric' : 'text';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  // ─── منطق الـ flow المحلي (ما قبل API) ───────────────────────────────────
  function handleLocalFlow(text) {
    const lower = text.trim();

    // ── اختيار النية (select_intent) ──
    if (currentStep === 'select_intent') {
      const firstName = getFirstName(localSession.name);

      if (lower.includes('سعر') || lower.includes('الذكي')) {
        setLocalSession(s => ({ ...s, intent: 'prices', stage: 'collect_marital_status' }));
        appendUserMsg(text);
        appendBotMsg({
          text: `تمام يا ${firstName}! 💪\nخليني آخذ بياناتك عشان أحسبلك أفضل عرض.\n\nأول حاجة: إيه حالتك الاجتماعية؟`,
          cta: 'اكتب أعزب أو متزوج 👇',
          nextStep: 'collect_marital_status'
        });
        return true;
      }

      if (lower.includes('شروط')) {
        setLocalSession(s => ({ ...s, intent: 'conditions', stage: 'select_conditions_type' }));
        appendUserMsg(text);
        appendBotMsg({
          text: `تمام يا ${firstName}! 📋\nتحب تعرف شروط إيه بالظبط؟`,
          cta: 'اختار من الأزرار 👇',
          nextStep: 'select_conditions_type'
        });
        return true;
      }

      if (lower.includes('القانوني')) {
        setLocalSession(s => ({ ...s, intent: 'violations', stage: 'violations_redirect' }));
        const homePageUrl = getHomePageUrl();
        appendUserMsg(text);
        appendBotMsg({
          text: `تمام يا ${firstName}! 🏛️\nللاطلاع على المخالفات، تم توجيهك للصفحة الرئيسية للموقع:\n\n🔗 www.example.com`,
          cta: '',
          nextStep: 'violations_redirect',
          intent: 'violations'
        });
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            window.location.href = homePageUrl;
          }, 1200);
        }
        return true;
      }
    }

    // ── اختيار نوع الشروط ──
    if (currentStep === 'select_conditions_type') {
      if (lower.includes('وحدة') || lower.includes('سكنية')) {
        appendUserMsg(text);
        appendBotMsg({
          text: UNIT_CONDITIONS_TEXT,
          cta: 'هل تحتاج مساعدة في حاجة تانية؟',
          nextStep: 'show_unit_conditions',
          intent: 'conditions'
        });
        return true;
      }

      if (lower.includes('شخص') || lower.includes('الشخص')) {
        appendUserMsg(text);
        appendBotMsg({
          text: PERSON_CONDITIONS_TEXT,
          cta: 'هل تحتاج مساعدة في حاجة تانية؟',
          nextStep: 'show_person_conditions',
          intent: 'conditions'
        });
        return true;
      }
    }

    return false; // مش flow محلي → روح للـ API
  }

  // ─── بعد إدخال الاسم ─────────────────────────────────────────────────────
  function handleNameCapture(text) {
    if (currentStep !== 'collect_name') return false;

    const candidate = text.trim()
      .replace(/^(?:انا|أنا|اسمي|إسمي|اسمى|الاسم|انا اسمي)\s*/i, '')
      .replace(/[^\u0600-\u06FFa-zA-Z\s]/g, '')
      .trim();

    if (!candidate || candidate.length < 2 || /\d/.test(candidate)) return false;

    const firstName = getFirstName(candidate);
    setLocalSession(s => ({ ...s, name: candidate, stage: 'select_intent' }));
    appendUserMsg(text);
    appendBotMsg({
      text: `أهلاً وسهلا يا ${firstName} 👋 نورتنا!\n\ تعالى نبدأ ونعرف إيه اللي ممكن أساعدك فيه بخصوص التمويل العقاري؟`,
      cta: 'اختار من الأزرار 👇',
      nextStep: 'select_intent'
    });
    return true;
  }

  // ─── helpers لإضافة رسائل ─────────────────────────────────────────────────
  function appendUserMsg(text) {
    setMessages(prev => [...prev, createMessage({ sender: 'user', text })]);
  }

  function appendBotMsg({ text, cta = '', nextStep = 'default', intent = 'mortgage_info', images = [] }) {
    setMessages(prev => [...prev, createMessage({ sender: 'bot', text, cta, nextStep, intent, images })]);
  }

  // ─── الإرسال الرئيسي ──────────────────────────────────────────────────────
  async function sendMessage(rawText) {
    const text = String(rawText || '').trim();
    if (!text || loading) return;

    setError('');

    // back / restart
    if (text === 'back') {
      setMessages(prev => prev.slice(0, -2));
      return;
    }
    if (text === 'restart') {
      setLocalSession({ stage: 'collect_name', name: null, intent: null });
      setMessages([INITIAL_MESSAGE]);
      return;
    }

    // اسم المستخدم
    if (handleNameCapture(text)) return;

    // flow محلي (اختيار النية أو الشروط)
    if (handleLocalFlow(text)) return;

    // مسار الأسعار → API
    if (localSession.intent === 'prices' || currentStep === 'collect_phone' || NUMERIC_STEPS.has(currentStep) || currentStep === 'collect_marital_status') {
      appendUserMsg(text);
      setLoading(true);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            sessionId,
            stageHint: currentStep,
            clientData: {
              name: localSession.name
            }
          })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'تعذر إرسال الرسالة');

        setMessages(prev => [...prev, createMessage({
          sender: 'bot',
          text: data.reply,
          cta: data.cta,
          intent: data.intent,
          nextStep: data.next_step,
          images: data.images || []
        })]);
        setLocalSession(prev => ({
          ...prev,
          stage: data.next_step || prev.stage
        }));
      } catch (err) {
        console.error('Failed to send message:', err);
        setError(err.message);
        appendBotMsg({
          text: 'حصل خلل مؤقت في الاتصال.\nاكتب ردك تاني أو ابعت رقم موبايلك وسأكمل معاك من نفس النقطة.',
          cta: 'أعد المحاولة أو اكتب رقم موبايلك 👇',
          nextStep: currentStep
        });
      } finally {
        setLoading(false);
      }
      return;
    }

    // default: just echo or do nothing
    appendUserMsg(text);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim()) return;
    const value = input;
    setInput('');
    await sendMessage(value);
  }

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="mortgage-app" dir="rtl">
      <section className="chat-panel">

        {/* شريط الأدوات */}
        <div className="chat-toolbar">
          <button type="button" className="ghost-button" onClick={() => sendMessage('back')} disabled={loading}>
            رجوع
          </button>
          <button type="button" className="ghost-button" onClick={() => sendMessage('restart')} disabled={loading}>
            إعادة البدء
          </button>
        </div>

        {/* أزرار سريعة */}
        

        {/* نافذة الرسائل */}
        <div className="messages-window">
          {messages.map(message => {
            const propertyCards = normalizePropertyCards(message.images);
            return (
              <article
                key={message.id}
                className={`message-card ${message.sender} ${propertyCards.length ? 'has-cards' : ''}`}
              >
                <div className="message-body">
                  {renderMessageLines(message.text).map((line, i) => (
                    <p key={`${message.id}-${i}`}>{line}</p>
                  ))}
                </div>

                {propertyCards.length > 0 && (
                  <div className="property-cards">
                    {propertyCards.map(card => (
                      <article key={card.id} className="property-card">
                        <img className="property-card-image" src={card.image} alt={card.title} loading="lazy" />
                        <div className="property-card-content">
                          <h3 className="property-card-title">{card.title}</h3>
                          <p className="property-card-price">{card.priceLabel}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </article>
            );
          })}

          {loading && (
            <article className="message-card bot loading">
              <div className="message-meta">
                <span className="sender-badge bot">المستشار</span>
              </div>
              <div className="typing-indicator">
                <span /><span /><span />
              </div>
            </article>
          )}

          <div ref={messagesEndRef} />
        </div>

        {error && <p className="error-banner">{error}</p>}

        {quickActions.length > 0 && (
          <div className="quick-actions" aria-label="اقتراحات سريعة">
            {quickActions.map(action => (
              <button
                key={action}
                type="button"
                className="quick-action"
                onClick={() => sendMessage(action)}
                disabled={loading}
              >
                {action}
              </button>
            ))}
          </div>
        )}

        {/* محرر الرسالة */}
        <form className="composer" onSubmit={handleSubmit}>
         

          <div className="composer-row">
            <input
              inputMode={inputMode}
              enterKeyHint="send"
              dir="auto"
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={placeholder}
              disabled={loading || currentStep === 'violations_redirect'}
            />
            <button type="submit" disabled={loading || !input.trim() || currentStep === 'violations_redirect'}>
              {loading ? 'جار الإرسال...' : 'ارسل'}
            </button>
          </div>
        </form>

      </section>
    </div>
  );
}

export default MortgageChatApp;
