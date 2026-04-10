import { useEffect, useRef, useState } from 'react';
import './App.css';


// الرسالة الافتتاحية اللي بتظهر أول ما التطبيق يشتغل
const INITIAL_MESSAGE = {
  id: 'welcome-message',
  sender: 'bot',
  intent: 'mortgage_info',
  nextStep: 'collect_name',
  text: 'ممكن أعرف اسم حضرتك؟',
  cta: 'اكتب اسم حضرتك ونبدأ خطوة خطوة 👇',
  images: []
};

const QUICK_ACTIONS = {
  collect_name: [],
  collect_marital_status: ['أعزب', 'متزوج'],
  collect_income: [],
  collect_obligations: [],
  collect_down_payment: [],
  collect_property_price: [],
  collect_phone: [],
  lead_saved: [],
  default: []
};

const PLACEHOLDERS = {
  collect_name: 'مثال: أحمد جمال',
  collect_marital_status: 'مثال: أعزب',
  collect_income: 'مثال: صافي دخلي 13000 جنيه',
  collect_obligations: 'مثال: 0 أو 2500 جنيه',
  collect_down_payment: 'مثال: 0 أو 250 ألف جنيه',
  collect_property_price: 'مثال: سعر الوحدة مليون جنيه',
  collect_phone: 'مثال: رقمي 01********',
  default: 'اكتب ردك هنا'
};

const STEP_TITLES = {
  collect_name: 'بيانات أساسية',
  collect_marital_status: 'الحالة الاجتماعية',
  collect_income: 'الدخل الشهري',
  collect_obligations: 'الالتزامات الحالية',
  collect_down_payment: 'المقدم',
  collect_property_price: 'سعر الوحدة',
  collect_phone: 'التواصل',
  lead_saved: 'تم تسجيل طلبك',
  default: 'الخطوة الحالية'
};

const NUMERIC_STEPS = new Set([
  'collect_income',
  'collect_obligations',
  'collect_down_payment',
  'collect_property_price'
]);

function createMessage({
  sender,
  text,
  cta = '',
  intent = 'mortgage_info',
  nextStep = 'collect_name',
  images = []
}) {
  return {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${sender}-${Date.now()}-${Math.random()}`,
    sender,
    text,
    cta,
    intent,
    nextStep,
    images
  };
}

// بيرجع الأزرار المناسبة حسب المرحلة الحالية
function getQuickActions(step = 'default') {
  return QUICK_ACTIONS[step] || QUICK_ACTIONS.default;
}

// بيرجع placeholder مناسب حسب المرحلة
function getPlaceholder(step = 'default') {
  return PLACEHOLDERS[step] || PLACEHOLDERS.default;
}

// بيقسم الرسالة لسطور (علشان كل سطر يتعرض لوحده)
function renderMessageLines(text) {
  return String(text || '')
    .split('\n')
    .filter(Boolean);
}

function normalizePropertyCards(images = []) {
  return images
    .map((item, index) => {
      if (!item) return null;

      if (typeof item === 'string') {
        return {
          id: `image-${index}`,
          title: `وحدة مقترحة ${index + 1}`,
          image: item,
          priceLabel: ''
        };
      }

      return {
        id: item.id || `image-${index}`,
        title: item.title || `وحدة مقترحة ${index + 1}`,
        image: item.image || item.imageUrl || '',
        priceLabel: item.priceLabel || item.price || ''
      };
    })
    .filter((item) => item?.image);
}

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
  const messagesEndRef = useRef(null);

  const lastBotMessage =
    [...messages].reverse().find((message) => message.sender === 'bot') || INITIAL_MESSAGE;
  const quickActions = getQuickActions(lastBotMessage.nextStep);
  const placeholder = getPlaceholder(lastBotMessage.nextStep);
  const stepTitle = STEP_TITLES[lastBotMessage.nextStep] || STEP_TITLES.default;
  const inputMode = lastBotMessage.nextStep === 'collect_phone'
    ? 'tel'
    : NUMERIC_STEPS.has(lastBotMessage.nextStep)
      ? 'numeric'
      : 'text';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  async function sendMessage(rawText) {
    const text = String(rawText || '').trim();

    if (!text || loading) {
      return;
    }

    setError('');
    setMessages((prev) => [...prev, createMessage({ sender: 'user', text })]);
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sessionId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'تعذر إرسال الرسالة');
      }

      setMessages((prev) => [
        ...prev,
        createMessage({
          sender: 'bot',
          text: data.reply,
          cta: data.cta,
          intent: data.intent,
          nextStep: data.next_step,
          images: data.images || []
        })
      ]);
    } catch (sendError) {
      console.error('Failed to send message:', sendError);
      setError(sendError.message);
      setMessages((prev) => [
        ...prev,
        createMessage({
          sender: 'bot',
          text:
            'حصل خلل مؤقت في الاتصال.\nاكتب ردك تاني أو ابعت رقم موبايلك وسأكمل معاك من نفس النقطة.',
          cta: 'أعد المحاولة أو اكتب رقم موبايلك 👇',
          intent: 'lead_capture',
          nextStep: lastBotMessage.nextStep || 'collect_phone'
        })
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!input.trim()) return;

    const value = input;
    setInput('');
    await sendMessage(value);
  }

  return (
    <div className="mortgage-app" dir="rtl">
      <section className="chat-panel">
        <div className="chat-toolbar">
          <button
            type="button"
            className="ghost-button"
            onClick={() => sendMessage('back')}
            disabled={loading}
          >
            رجوع
          </button>

          <button
            type="button"
            className="ghost-button"
            onClick={() => sendMessage('restart')}
            disabled={loading}
          >
            إعادة البدء
          </button>
        </div>

        {quickActions.length > 0 && (
          <div className="quick-actions" aria-label="اقتراحات سريعة">
            {quickActions.map((action) => (
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

        <div className="messages-window">
          {messages.map((message) => {
            const propertyCards = normalizePropertyCards(message.images);

            return (
              <article
                key={message.id}
                className={`message-card ${message.sender} ${
                  propertyCards.length ? 'has-cards' : ''
                }`}
              >
                <div className="message-body">
                  {renderMessageLines(message.text).map((line, index) => (
                    <p key={`${message.id}-${index}`}>{line}</p>
                  ))}
                </div>

                {propertyCards.length > 0 && (
                  <div className="property-cards">
                    {propertyCards.map((card) => (
                      <article key={card.id} className="property-card">
                        <img
                          className="property-card-image"
                          src={card.image}
                          alt={card.title}
                          loading="lazy"
                        />
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
                <span />
                <span />
                <span />
              </div>
            </article>
          )}

          <div ref={messagesEndRef} />
        </div>

        {error && <p className="error-banner">{error}</p>}

        <form className="composer" onSubmit={handleSubmit}>
          

          <div className="composer-row">
            <input
              inputMode={inputMode}
              enterKeyHint="send"
              dir="auto"
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={placeholder}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            {loading ? 'جار الإرسال...' : 'ارسل'}
          </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default MortgageChatApp;
