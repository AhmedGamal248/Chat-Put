const CONFIG = {
  annualInterestRate  : 0.12 ,
  loanYears:  30,
  minDownPaymentRatio: 0.2,
  maxIncomeRatio: 0.4,
};

const ARABIC_DIGITS = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',};

const LEGAL_STATUS_LABELS = {
  registered          : 'مسجل وشهره العقاري واضح',
  licensed            : 'مرخص لكن ما زال يحتاج مراجعة مستندات الملكية',
  preliminary_contract: 'بعقد ابتدائي فقط وقد يحتاج مراجعة بنكية وقانونية إضافية',
  violation_risk      : 'فيه مخاطرة قانونية وتحتاج مراجعة دقيقة قبل التمويل',
};


//convert arabic digits to english
function normalizeText(value = '') {
  return [...String(value)]
    .map(c => ARABIC_DIGITS[c] ?? c)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

//format money in arabic
function formatMoney(value) {
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat('ar-EG').format(Math.round(value));
}



/** تحويل نص يحتوي رقم (مع "مليون / ألف") لرقم */
function parseAmount(text) {
  if (!text) return null;
  const normalized = normalizeText(String(text)).toLowerCase();
  const match = normalized.match(/\d+(?:[\d,.]*\d)?|\d/);
  if (!match) return null;

  let amount = Number(match[0].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return null;

  if (/مليار|billion/.test(normalized)) amount *= 1_000_000_000;
  else if (/مليون|million/.test(normalized)) amount *= 1_000_000;
  else if (/ألف|الف|thousand/.test(normalized)) amount *= 1_000;

  return Math.round(amount);
}

// استخراج الارقام من الرسالة
function extractAmountNearKeywords(message, keywords) {
  const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const amount  = '(\\d+(?:[\\d,.]*\\d)?(?:\\s*(?:مليار|مليون|ألف|الف|billion|million|thousand))?)';

  const forward  = message.match(new RegExp(`(?:${escaped})[^\\d]{0,20}${amount}`, 'i'));
  const backward = message.match(new RegExp(`${amount}[^\\d]{0,20}(?:${escaped})`, 'i'));

  return parseAmount(forward?.[1]) ?? parseAmount(backward?.[1]) ?? null;
}

/** كل الأرقام الحرة في الرسالة */
function extractAllAmounts(message = '') {
  return (message.match(/\d+(?:[\d,.]*\d)?(?:\s*(?:مليار|مليون|ألف|الف|billion|million|thousand))?/gi) || [])
    .map(parseAmount)
    .filter(v => Number.isFinite(v) && v > 0);
}


//extract egyptian phone number from text
function extractPhone(value = '') {
  const text = normalizeText(value);
  for (const item of (text.match(/(?:\+?20|0)?1[0125]\d{8}/g) || [])) {
    let digits = item.replace(/\D/g, '');
    if (digits.startsWith('20') && digits.length === 12) digits = `0${digits.slice(2)}`;
    if (digits.startsWith('1')  && digits.length === 10) digits = `0${digits}`;
    if (/^01[0125]\d{8}$/.test(digits)) return digits;
  }
  return null;
}

// extract legal status from text
function extractLegalStatus(message = '') {
  if (/غير مسجل|عقد ابتدائي|توكيل/.test(message)) return 'preliminary_contract';
  if (/بدون ترخيص|من غير ترخيص|مخالفة|مخالفات/.test(message)) return 'violation_risk';
  if (/شهر عقاري|مسجل|مسجلة/.test(message)) return 'registered';
  if (/مرخص|مرخصة|رخصة|رخصه/.test(message)) return 'licensed';
  return null;
}


//merge all data 
function extractData(userMessage, stage = '') {
  const msg = normalizeText(userMessage).toLowerCase();
  const amounts = extractAllAmounts(msg);

  let income = extractAmountNearKeywords(msg, ['دخل','راتب','مرتب','صافي','شهري','income','salary']);
  let propertyValue = extractAmountNearKeywords(msg, ['سعر','ثمن','ميزانية','الوحدة','العقار','الشقة','الشقه','الفيلا','price','budget']);
  let downPayment   = extractAmountNearKeywords(msg, ['مقدم','دفعة','دفعة اولى','دفعة أولى','حجز','down payment']);
  let propertyLegalStatus   = extractAmountNearKeywords(msg, ['توكيل','عقد ابتدائي','غير مسجل','بدون ترخيص' ,'ترخيص','مخالفة','مخالفات' , 'شهر عقاري','مسجل','مسجلة','مرخص','مرخصة','رخصة','رخصه']);


  // fallback: لو رقم وحيد في المرحلة الصح
  if (!income && amounts.length === 1 && stage === 'collect_income') income = amounts[0];
  if (!propertyValue && amounts.length === 1 && stage === 'collect_property_price') propertyValue = amounts[0];
  if (!downPayment && amounts.length === 1 && stage === 'collect_down_payment') downPayment = amounts[0];
  if (!propertyLegalStatus && amounts.length === 1 && stage === 'collect_property_status') propertyLegalStatus = amounts[0];


  return {
    income,
    propertyValue,
    downPayment,
    propertyLegalStatus: extractLegalStatus(msg),
    phone: extractPhone(msg),
  };
}

// دمج البيانات القديمة بالجديدة — الجديد يكسب 
function mergeData(existing = {}, captured = {}) {
  return {
    income             : captured.income             ?? existing.income             ?? null,
    propertyValue      : captured.propertyValue      ?? existing.propertyValue      ?? null,
    downPayment        : captured.downPayment         ?? existing.downPayment        ?? null,
    phone              : captured.phone               ?? existing.phone              ?? null,
    propertyLegalStatus: captured.propertyLegalStatus ?? existing.propertyLegalStatus ?? null,
  };
}


// calc monthly installment
function calcMonthlyInstallment(loanAmount) {
  if (!Number.isFinite(loanAmount) || loanAmount <= 0) return null;

  const monthlyInterestRate = CONFIG.annualInterestRate / 12;
  const numOfMun = CONFIG.loanYears * 12;

  if (!monthlyInterestRate) return Math.round(loanAmount / numOfMun);

  const factor = Math.pow(1 + monthlyInterestRate, numOfMun);
  return Math.round((loanAmount * monthlyInterestRate * factor) / (factor - 1));
}


// حساب كامل بناء على سعر الوحدة والمقدم
function calcMortgage(data = {}) {
  if (!Number.isFinite(data.propertyValue) || data.propertyValue <= 0) return null;

  const minimumDownPayment = Math.round(data.propertyValue * CONFIG.minDownPaymentRatio);
  const actualDownPayment  = Number.isFinite(data.downPayment) ? data.downPayment : minimumDownPayment;
  const loanAmount         = Math.max(data.propertyValue - actualDownPayment, 0);

  return {
    propertyValue      : data.propertyValue,
    minimumDownPayment,
    actualDownPayment,
    loanAmount,
    monthlyInstallment : calcMonthlyInstallment(loanAmount),
  };
}

// حساب القدرة الشرائية على حسب الدخل الشهري
function calcAffordability(data = {}) {
  if (!Number.isFinite(data.income) || data.income <= 0) return null;

  const maxInstallment = Math.round(data.income * CONFIG.maxIncomeRatio);
  const r = CONFIG.annualInterestRate / 12;
  const n = CONFIG.loanYears * 12;
  const maxLoanAmount  = r
    ? Math.round((maxInstallment * (Math.pow(1 + r, n) - 1)) / (r * Math.pow(1 + r, n)))
    : maxInstallment * n;

  return {
    maxInstallment,
    maxLoanAmount,
    estimatedPropertyValue: Math.round(maxLoanAmount / (1 - CONFIG.minDownPaymentRatio)),
  };
}


function detectIntent(message, mergedData = {}) {
  if (mergedData.phone) return 'lead_capture';
  if (/(قانوني|قانونية|شهر عقاري|مسجل|عقد|ترخيص|رخصة|مخالفة|تصالح|ملكية|تسجيل|سند)/i.test(message))
    return 'legal_check';
  if (/(وحدة|وحدات|شقة|شقق|فيلا|دوبلكس|كمبوند|ابحث|ادور|أدور|ترشح|منطقة|مشروع)/i.test(message))
    return 'property_search';
  return 'mortgage_info';
}

function resolveNextStep(intent, data = {}) {
  if (data.phone)                                                 return 'lead_saved';
  if (intent === 'legal_check' && !data.propertyLegalStatus)      return 'collect_property_status';
  if (!data.income)                                               return 'collect_income';
  if (!data.propertyValue && intent !== 'legal_check')            return 'collect_property_price';
  if (!data.downPayment && data.propertyValue)                    return 'collect_down_payment';
  return 'collect_phone';
}

// final response
function buildReply(lines, cta) {
  return [...lines.filter(Boolean).map(l => l.trim()), cta].join('\n');
}

function buildResponse(lines, { intent, nextStep, cta }) {
  return { reply: buildReply(lines, cta), intent, next_step: nextStep, cta };
}

function buildFallbackResponse({ mergedData, intent }) {
  const nextStep = resolveNextStep(intent, mergedData);
  const mortgage = calcMortgage(mergedData);
  const affordability = calcAffordability(mergedData);
  const rateLabel = `${Math.round(CONFIG.annualInterestRate * 100)}%`;
  const legalLabel = mergedData.propertyLegalStatus ? LEGAL_STATUS_LABELS [mergedData.propertyLegalStatus]: null;

  // ── تم استلام الهاتف ──────────────────────────────────────────
  if (mergedData.phone) {
    return buildResponse([
      `- ممتاز، رقمك  ${mergedData.phone}.`,
      mortgage?.monthlyInstallment
        ? `- مبدئياً القسط التقديري قريب من ${formatMoney(mortgage.monthlyInstallment)} جنيه شهرياً حسب فائدة استرشادية ${rateLabel}.`
        : '- فريقنا هيكلمك لاستكمال التقييم وترشيح أنسب سيناريو تمويل.',
      legalLabel
        ? `- والوضع القانوني الحالي للوحدة يبدو ${legalLabel}.`
        : "",
    ], { intent: 'lead_capture', nextStep, cta: `  - لو تحب تشوف وحدات مناسبة ليك قولي وانا اعرضلك كل الوحدات اللي تناسب دخلك 👇` });
  }





  // ── فحص قانوني ───────────────────────────────────────────────
  if (intent === 'legal_check') {
    return buildResponse([
      '- في التمويل العقاري داخل مصر أهم فحص قانوني يكون للملكية، الترخيص، وعدم وجود مخالفات.',
      legalLabel
        ? `- من وصفك الحالي، وضع الوحدة يبدو ${legalLabel}.`
        : '- لو الوحدة غير مسجلة أو بعقد ابتدائي فقط، البنك غالباً يطلب مراجعة إضافية قبل الموافقة.',
      '- أهم المستندات: عقد الملكية أو التخصيص، الرخصة، بيان عدم مخالفات.',
    ], {
      intent  : 'legal_check',
      nextStep,
      cta     : nextStep === 'collect_property_status'
        ? 'ابعت وضع الوحدة القانوني الحالي ونراجع قابليتها للتمويل 👇'
        : 'سيب رقمك عشان فريقنا يراجع الملف القانوني معاك 👇',
    });
  }



  // ── لم يُذكر الدخل بعد ───────────────────────────────────────
  if (!mergedData.income) {
    return buildResponse([
      intent === 'property_search'
        ? '- أقدر أوضح لك التمويل العقاري في مصر خطوة بخطوة وبشكل عملي.'
        : 'للموظفين براتب:',
          'كشف حساب بنكي عن آخر 3 أشهر , صورة من بطاقة الرقم القومي',
          'للأفراد العاملين لحسابهم الخاص:',
          'صورة من البطاقة الضريبية, صورة من بطاقة الرقم القومي , صورة من السجل التجاري (مستخرج حديث)',
          'كشف حساب بنكي عن آخر 6 أشهر أو إقرارات ضريبية عن آخر 3 سنوات أو قوائم مالية عن آخر 3 سنوات معتمدة من قبل مراجع خارجي مسجل لدى البنك المركزي المصري',
            'لو تحب تشوف الشروط كاملة "هنا هنحط لينك لشروط البنك" ',
            
        ], { intent, nextStep, cta: 'ابعت صافي دخلك الشهري ونبدأ التأهيل المبدئي 👇' ,
           images : [
    "https://example.com/img1.jpg",
    "https://example.com/img2.jpg"
  ],});
  }

  // ── لم يُذكر سعر الوحدة بعد ─────────────────────────────────
  if (!mergedData.propertyValue) {
    return buildResponse([
      intent === 'property_search'
        ? '- بعد معرفة دخلك أقدر أحدد نطاق سعر مناسب وأرشح لك وحدات أقرب لميزانيتك.'
        : '- بعد معرفة دخلك، الخطوة الأهم هي تحديد سعر الوحدة أو الميزانية المستهدفة.',
      affordability
        ? `- على دخل ${formatMoney(mergedData.income)} جنيه، القسط الآمن غالباً في حدود ${formatMoney(affordability.maxInstallment)} جنيه شهرياً، وده قد يناسب وحدة قرب ${formatMoney(affordability.estimatedPropertyValue)} جنيه بمقدم افتراضي 20%.`
        : null,
    ], { intent, nextStep, cta: 'ابعت سعر الوحدة أو ميزانيتك التقريبية ونكمل الحسابات معاك 👇',
           images : [
    "https://example.com/img1.jpg",
    "https://example.com/img2.jpg"
  ],
     });
  }

  // ── لم يُذكر المقدم بعد ──────────────────────────────────────
  if (!mergedData.downPayment) {
    const installmentOk = mortgage?.monthlyInstallment && mergedData.income &&
      mortgage.monthlyInstallment <= mergedData.income * CONFIG.maxIncomeRatio;

    return buildResponse([
      `- على سعر وحدة حوالي ${formatMoney(mergedData.propertyValue)} جنيه، الحد الأدنى الشائع للمقدم يبدأ من ${formatMoney(mortgage?.minimumDownPayment || 0)} جنيه.`,
      mortgage?.monthlyInstallment
        ? `- القسط التقديري على ${CONFIG.loanYears} سنة وبفائدة استرشادية ${rateLabel} يقارب ${formatMoney(mortgage.monthlyInstallment)} جنيه شهرياً.`
        : null,
      mortgage?.monthlyInstallment && mergedData.income
        ? installmentOk
          ? '- القسط يبدو داخل النطاق الآمن مقارنة بصافي دخلك الشهري.'
          : '- القسط المتوقع أعلى من النطاق الآمن لدخلك الحالي وقد نحتاج سعر أقل أو مقدم أكبر.'
        : null,
    ], { intent: 'mortgage_info', nextStep, cta: 'ابعت قيمة المقدم المتاح معاك  عشان تعرف القسط هيكون كام تقريبا 👇' });
  }


 

  // ── عندنا كل البيانات ← اطلب رقم الهاتف ─────────────────────
  const installmentOk = mortgage?.monthlyInstallment && mergedData.income &&
    mortgage.monthlyInstallment <= mergedData.income * CONFIG.maxIncomeRatio;

  return buildResponse([
    `- بسعر وحدة ${formatMoney(mergedData.propertyValue)} جنيه ومقدم ${formatMoney(mergedData.downPayment)} جنيه، التمويل المبدئي يبدو قابل للمراجعة.`,
    mortgage?.monthlyInstallment
      ? `- القسط التقديري يقارب ${formatMoney(mortgage.monthlyInstallment)} جنيه شهرياً، وده ${installmentOk ? 'أقرب للنطاق الآمن لدخلك الحالي.' : 'يحتاج تأكيد من الفريق حسب تفاصيل الدخل والالتزامات.'}`
      : null,
    '- لو عايز تعرف كل الاوراق المطلوبة عشان تاخد تمويل عقاري "هنا هنحط لينك لشروط البنك" ',
  ], { intent: 'lead_capture', nextStep, cta:  'سيب رقمك عشان فريقنا يقدر يساعدك اكتر 👇' });


}


// main function
async function getChatResponse({ userMessage, sessionData = {}, stage = 'welcome' }) {

  const capturedData = extractData(userMessage, stage);
  const mergedData   = mergeData(sessionData, capturedData);
  const intent       = detectIntent(normalizeText(userMessage).toLowerCase(), mergedData);

  return {
    ...buildFallbackResponse({ mergedData, intent }),
    dataCaptured: capturedData,
  };
}

export { getChatResponse, extractPhone };
