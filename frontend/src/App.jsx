import { useEffect, useRef, useState } from 'react'
import './App.css'


// الرسالة الافتتاحية اللي بتظهر أول ما التطبيق يشتغل
const INITIAL_MESSAGE = {
  id: 'welcome-message',
  sender: 'bot', // الرسالة من البوت
  intent: 'mortgage_info', // نوع النية (intent)
  nextStep: 'collect_income', // الخطوة الجاية في الفلو
  text:
    '- اهلا بك في مستشارك العقاري للتمويل في مصر.\n- هاساعدك تفهم الاهلية والمقدم والقسط والمستندات المطلوبة خطوة بخطوة.\nابعت صافي دخلك الشهري ونبدأ الطلب 👇',
  cta: 'ابعت صافي دخلك الشهري او سعر الوحدة ونبدأ الطلب 👇'
}


// أزرار جاهزة بتظهر حسب المرحلة
const QUICK_ACTIONS = {
  welcome: [
    'عايز اعرف التمويل المناسب ليا',
    'بدور على شقة بالتقسيط',
    'عايز اراجع الموقف القانوني للوحدة'
  ],
  collect_property_status: [
    'الوحدة مسجلة شهر عقاري',
    'معايا عقد ابتدائي فقط',
    'الوحدة مرخصة'
  ],

  default: [
    
    'ايه المستندات المطلوبة؟',
    'عايز اراجع الموقف القانوني للوحدة',
    'بدور على شقة بالتقسيط',

  ]
}


// النص اللي بيظهر جوه input حسب المرحلة
const PLACEHOLDERS = {
  collect_income: 'مثال: صافي دخلي 30000 جنيه',
  collect_property_price: 'مثال: سعر الشقة 2.5 مليون',
  collect_down_payment: 'مثال: المقدم 500 الف',
  collect_phone: 'مثال: رقمي 01********',
  default: 'اكتب سؤالك او بياناتك هنا'
}


// دالة بتعمل message object جديد
function createMessage({ 
  sender,
  text,
  cta = '',
  intent = 'mortgage_info',
  nextStep = 'welcome',
  images  = []

    }) {

  return {
    id:
      // إنشاء ID فريد لكل رسالة
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${sender}-${Date.now()}-${Math.random()}`,
    sender, // مين اللي باعت (user / bot)
    text,   // محتوى الرسالة
    cta,    // call to action (اختياري)
    intent, // النية
    nextStep, // الخطوة التالية
    images  // الاقتراحات
  }
}


// بيرجع الأزرار المناسبة حسب المرحلة الحالية
function getQuickActions(step = 'welcome') {
  return QUICK_ACTIONS[step] || QUICK_ACTIONS.default
}


// بيرجع placeholder مناسب حسب المرحلة
function getPlaceholder(step = 'default') {
  return PLACEHOLDERS[step] || PLACEHOLDERS.default
}


// بيقسم الرسالة لسطور (علشان كل سطر يتعرض لوحده)
function renderMessageLines(text) {
  return String(text || '')
    .split('\n')
    .filter(Boolean)
}

function normalizePropertyCards(images = []) {
  return images
    .map((item, index) => {
      if (!item) return null

      if (typeof item === 'string') {
        return {
          id: `image-${index}`,
          title: `وحدة مقترحة ${index + 1}`,
          image: item,
          priceLabel: ''
        }
      }

      return {
        id: item.id || `image-${index}`,
        title: item.title || `وحدة مقترحة ${index + 1}`,
        image: item.image || item.imageUrl || '',
        priceLabel: item.priceLabel || item.price || ''
      }
    })
    .filter((item) => item?.image)
}


function MortgageChatApp() {

  // state لتخزين كل الرسائل
  const [messages, setMessages] = useState([INITIAL_MESSAGE])

  // state لقيمة input
  const [input, setInput] = useState('')

  // هل فيه request شغال ولا لأ
  const [loading, setLoading] = useState(false)

  // لتخزين أي error
  const [error, setError] = useState('')

  // sessionId ثابت لكل مستخدم (بيتبعت للباك)
  const [sessionId] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  )

  // reference لآخر رسالة (عشان نعمل scroll)
  const messagesEndRef = useRef(null)


  // بنجيب آخر رسالة من البوت
  const lastBotMessage =
    [...messages].reverse().find((message) => message.sender === 'bot') || INITIAL_MESSAGE

  // الأزرار بتتحدد حسب الخطوة الحالية
  const quickActions = getQuickActions(lastBotMessage.nextStep)

  // placeholder بيتحدد حسب الخطوة
  const placeholder = getPlaceholder(lastBotMessage.nextStep)


  // كل ما الرسائل تتغير → يعمل scroll لآخر رسالة
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])


  // دالة إرسال رسالة
  const sendMessage = async (rawText) => {
    const text = String(rawText || '').trim()

    // منع إرسال رسالة فاضية أو أثناء التحميل
    if (!text || loading) {
      return
    }

    setError('')

    // إضافة رسالة المستخدم
    setMessages((prev) => [...prev, createMessage({ sender: 'user', text })])

    setLoading(true)

    try {
      // إرسال الرسالة للـ API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sessionId })
      })

      const data = await response.json()

      // لو فيه error من السيرفر
      if (!response.ok) {
        throw new Error(data?.error || 'تعذر ارسال الرسالة')
      }

      // إضافة رد البوت
      setMessages((prev) => [
        ...prev,
        createMessage({
          sender: 'bot',
          text: data.reply,
          cta: data.cta,
          intent: data.intent,
          nextStep: data.next_step,
          images : data.images  || []

        })
      ])
    } catch (sendError) {
      console.error('Failed to send message:', sendError)

      setError(sendError.message)

      // رسالة fallback في حالة الخطأ
      setMessages((prev) => [
        ...prev,
        createMessage({
          sender: 'bot',
          text:
            '- حصل خلل مؤقت في الاتصال.\n- اعد الارسال او اكتب بياناتك من جديد وساكمل معك من نفس النقطة.\nاعد المحاولة او اكتب رقمك ونكمل المتابعة 👇',
          cta: 'اعد المحاولة او اكتب رقمك ونكمل المتابعة 👇',
          intent: 'lead_capture',
          nextStep: lastBotMessage.nextStep || 'collect_phone'
        })
      ])
    } finally {
      // إيقاف التحميل في كل الحالات
      setLoading(false)
    }
  }


  // لما المستخدم يعمل submit
  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!input.trim()) return

    const value = input

    setInput('') // تفريغ الـ input

    await sendMessage(value)
  }


  return (
    <div className="mortgage-app" dir="rtl">
      <section className="chat-panel">

        <div className="chat-toolbar">
          {/* زر الرجوع */}
          <button
            type="button"
            className="ghost-button"
            onClick={() => sendMessage('back')}
            disabled={loading}
          >
            رجوع
          </button>

          {/* زر إعادة البداية */}
          <button
            type="button"
            className="ghost-button"
            onClick={() => sendMessage('restart')}
            disabled={loading}
          >
            اعادة البدء
          </button>
        </div>

        {/* الأزرار السريعة */}
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

        {/* عرض الرسائل */}
        <div className="messages-window">
          {messages.map((message) => {
            const propertyCards = normalizePropertyCards(message.images)

            return (
            <article
              key={message.id}
              className={`message-card ${message.sender} ${propertyCards.length ? 'has-cards' : ''}`}
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
          )})}

          {/* مؤشر الكتابة أثناء التحميل */}
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

          {/* عنصر للـ scroll */}
          <div ref={messagesEndRef} />
        </div>

        {/* عرض الخطأ */}
        {error && <p className="error-banner">{error}</p>}

        {/* الفورم */}
        <form className="composer" onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={placeholder}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            {loading ? 'جار الارسال...' : 'ارسل'}
          </button>
        </form>
      </section>
    </div>
  )
}

export default MortgageChatApp
