import { useEffect, useRef, useState } from 'react'
import './App.css'

function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(() => Math.random().toString(36).substr(2, 9)) // Generate unique session ID

  useEffect(() => {
    // Set initial welcome message without API call
    const welcomeMessage = {
      id: Date.now(),
      sender: 'bot',
      text: 'مرحبا! 👋 أنا هنا لمساعدتك بخصوص التمويل العقاري في مصر. عايز تعرف أكتر أم عايز نحسب الأقساط؟',
      cta: 'ابدأ معايا لو سمحت'
    }
    setMessages([welcomeMessage])
  }, [])

  const sendMessage = async (text) => {
    setLoading(true)
    try {
      const userMessage = { id: Date.now(), sender: 'user', text };
      setMessages((prev) => [...prev, userMessage]);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sessionId })
      })

      const data = await response.json()
      const botMessage = { id: Date.now() + 1, sender: 'bot', text: data.reply, cta: data.cta }
      setMessages((prev) => [...prev, botMessage])

      // If user enters phone number, optionally persist lead explicitly
      const phonePattern = /(?:\+?20)?1[0125]\d{8}/g
      const phoneMatches = text.match(phonePattern)
      if (phoneMatches?.length) {
        const phone = phoneMatches[0]
        try {
          const leadResponse = await fetch('/api/lead', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
          })
          const leadData = await leadResponse.json()
          const leadMsg = { id: Date.now() + 2, sender: 'bot', text: leadData.message || 'تم حفظ بياناتك بنجاح.', cta: '' }
          setMessages((prev) => [...prev, leadMsg])
        } catch (leadError) {
          console.error('Failed to store lead:', leadError)
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!input.trim()) return
    await sendMessage(input)
    setInput('')
  }

  const handleBack = () => sendMessage('back')
  const handleRestart = () => sendMessage('restart')

  return (
    <div className="chat-container">
      <h1>Chat Put</h1>
      <div className="messages">
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.sender}`}>
            <strong>{msg.sender === 'bot' ? 'BOT' : 'You'}:</strong> {msg.text}
            {msg.cta && msg.sender === 'bot' && (
              <div className="cta">{msg.cta}</div>
            )}
          </div>
        ))}
      </div>
      <div className="controls">
        <button onClick={handleBack} disabled={loading}>Back</button>
        <button onClick={handleRestart} disabled={loading}>Restart</button>
      </div>
      <form onSubmit={handleSendMessage}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  )
}

const INITIAL_MESSAGE = {
  id: 'welcome-message',
  sender: 'bot',
  intent: 'mortgage_info',
  nextStep: 'collect_income',
  text:
    '- اهلا بك في مستشارك العقاري للتمويل في مصر.\n- هاساعدك تفهم الاهلية والمقدم والقسط والمستندات المطلوبة خطوة بخطوة.\nابعت صافي دخلك الشهري ونبدأ الطلب 👇',
  cta: 'ابعت صافي دخلك الشهري او سعر الوحدة ونبدأ الطلب 👇'
}

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

const PLACEHOLDERS = {
  collect_income: 'مثال: صافي دخلي 30000 جنيه',
  // collect_income: "",
  collect_property_price: 'مثال: سعر الشقة 2.5 مليون',
  // collect_property_price: "",
  collect_down_payment: 'مثال: المقدم 500 الف',
  // collect_down_payment: "",
  // collect_property_status: "",
  collect_phone: 'مثال: رقمي 01XXXXXXXXX',
  // collect_phone: "",
  default: 'اكتب سؤالك او بياناتك هنا'
}


function createMessage({ sender, text, cta = '', intent = 'mortgage_info', nextStep = 'welcome' }) {
  return {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${sender}-${Date.now()}-${Math.random()}`,
    sender,
    text,
    cta,
    intent,
    nextStep
  }
}

function getQuickActions(step = 'welcome') {
  return QUICK_ACTIONS[step] || QUICK_ACTIONS.default
}

function getPlaceholder(step = 'default') {
  return PLACEHOLDERS[step] || PLACEHOLDERS.default
}

function renderMessageLines(text) {
  return String(text || '')
    .split('\n')
    .filter(Boolean)
}

function MortgageChatApp() {
  const [messages, setMessages] = useState([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sessionId] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  )
  const messagesEndRef = useRef(null)

  const lastBotMessage =
    [...messages].reverse().find((message) => message.sender === 'bot') || INITIAL_MESSAGE
  const quickActions = getQuickActions(lastBotMessage.nextStep)
  const placeholder = getPlaceholder(lastBotMessage.nextStep)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  const sendMessage = async (rawText) => {
    const text = String(rawText || '').trim()

    if (!text || loading) {
      return
    }

    setError('')
    setMessages((prev) => [...prev, createMessage({ sender: 'user', text })])
    setLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sessionId })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || 'تعذر ارسال الرسالة')
      }

      setMessages((prev) => [
        ...prev,
        createMessage({
          sender: 'bot',
          text: data.reply,
          cta: data.cta,
          intent: data.intent,
          nextStep: data.next_step
        })
      ])
    } catch (sendError) {
      console.error('Failed to send message:', sendError)
      setError(sendError.message)
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
      setLoading(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!input.trim()) return
    const value = input
    setInput('')
    await sendMessage(value)
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
            اعادة البدء
          </button>
        </div>

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

        <div className="messages-window">
          {messages.map((message) => (
            <article key={message.id} className={`message-card ${message.sender}`}>
              <div className="message-meta">
                
               
              </div>

              <div className="message-body">
                {renderMessageLines(message.text).map((line, index) => (
                  <p key={`${message.id}-${index}`}>{line}</p>
                ))}
              </div>
            </article>
          ))}

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
