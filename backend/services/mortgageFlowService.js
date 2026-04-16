const MAX_INSTALLMENT_RATIO = 0.4;
const MIN_DOWN_PAYMENT_RATIO = 0.15;   // 5% من سعر الوحدة
const MAX_DOWN_PAYMENT_RATIO = 0.20;   // 20% من سعر الوحدة

const PROGRAMS = [
  {
    key: '8%',
    label: 'مبادرة 8% لمتوسطي الدخل',
    annualRate: 0.08,
    minPropertyValue: 0,
    maxPropertyValue: 900_000,
    maxYears: 30,
    adminFeeRate: 0.01,
    financeBands: [
      {
        minPropertyValue: 0,
        maxPropertyValue: 900_000,
        financeRatio: 0.85
      }
    ],
    incomeCaps: {
      single: 13_000,
      married: 18_000
    },
    getFinanceRatio(propertyValue) {
      return getFinanceRatioFromBands(this.financeBands, propertyValue);
    }
  },
  {
    key: '12%',
    label: 'مبادرة 12% لمتوسطي الدخل',
    annualRate: 0.12,
    minPropertyValue: 200_000,
    maxPropertyValue: 2_000_000,
    maxYears: 25,
    adminFeeRate: 0.01,
    financeBands: [
      {
        minPropertyValue: 200_000,
        maxPropertyValue: 2_000_000,
        financeRatio: 0.8
      }
    ],
    incomeCaps: {
      single: 40_000,
      married: 50_000
    },
    getFinanceRatio() {
      return 0.8;
    }
  }
];

const ARABIC_DIGITS = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
};

function normalizeText(value = '') {
  return [...String(value)]
    .map(char => ARABIC_DIGITS[char] ?? char)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat('ar-EG').format(Math.round(value));
}

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

function escapeKeyword(keyword = '') {
  return keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractAmountNearKeywords(message, keywords = []) {
  if (!keywords.length) return null;
  const escapedKeywords = keywords.map(k => escapeKeyword(k)).join('|');
  const amountPattern = '(\\d+(?:[\\d,.]*\\d)?(?:\\s*(?:مليار|مليون|ألف|الف|billion|million|thousand))?)';
  const forwardMatch = message.match(new RegExp(`(?:${escapedKeywords})[^\\d]{0,20}${amountPattern}`, 'i'));
  const backwardMatch = message.match(new RegExp(`${amountPattern}[^\\d]{0,20}(?:${escapedKeywords})`, 'i'));
  return parseAmount(forwardMatch?.[1]) ?? parseAmount(backwardMatch?.[1]) ?? null;
}

function extractAllAmounts(message = '') {
  return (message.match(/\d+(?:[\d,.]*\d)?(?:\s*(?:مليار|مليون|ألف|الف|billion|million|thousand))?/gi) || [])
    .map(m => parseAmount(m))
    .filter(v => Number.isFinite(v) && v >= 0);
}

function extractPhone(value = '') {
  const text = normalizeText(value);
  const matches = text.match(/(?:\+?20|0)?1[0125]\d{8}/g) || [];
  for (const match of matches) {
    let digits = match.replace(/\D/g, '');
    if (digits.startsWith('20') && digits.length === 12) digits = `0${digits.slice(2)}`;
    else if (digits.startsWith('1') && digits.length === 10) digits = `0${digits}`;
    if (/^01[0125]\d{8}$/.test(digits)) return digits;
  }
  return null;
}

function hasNegativeNumber(value = '') {
  const normalized = normalizeText(value);
  return /(^|[^\w])-\s*\d/.test(normalized) || /سالب/.test(normalized);
}

function extractName(userMessage = '', stage = '', existingData = {}) {
  if (existingData.name) return null;
  const normalized = normalizeText(userMessage);
  if (stage !== 'collect_name' && !/^(?:انا|أنا|اسمي|إسمي|اسمى|الاسم)\b/i.test(normalized)) return null;
  const candidate = normalized
    .replace(/^(?:انا|أنا|اسمي|إسمي|اسمى|الاسم|انا اسمي)\s*/i, '')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!candidate || candidate.length < 2 || candidate.length > 40) return null;
  if (/\d/.test(candidate)) return null;
  if (/(أعزب|اعزب|متزوج|دخل|راتب|قسط|مقدم|شقة|وحدة|تمويل|عقار|موبايل|هاتف|رقم)/i.test(candidate)) return null;
  return candidate;
}

function extractMaritalStatus(userMessage = '') {
  const message = normalizeText(userMessage).toLowerCase();
  if (/(متزوج|متجوز|متزوجة|married)/i.test(message)) return 'married';
  if (/(أعزب|اعزب|عزباء|single)/i.test(message)) return 'single';
  return null;
}

function extractObligations(userMessage = '', stage = '') {
  const message = normalizeText(userMessage).toLowerCase();
  const compactValue = message.replace(/\s+/g, ' ').trim();
  if (stage === 'collect_obligations' && /^(?:مفيش|مافيش|لا يوجد|بدون|ولا حاجة|صفر|none|no|0+)$/.test(compactValue)) return 0;
  const amount = extractAmountNearKeywords(message, ['التزامات', 'التزام', 'قسط', 'اقساط', 'أقساط', 'قرض', 'ديون', 'مديونية', 'credit', 'loan']);
  if (Number.isFinite(amount)) return amount;
  const amounts = extractAllAmounts(message);
  if (stage === 'collect_obligations' && amounts.length === 1) return amounts[0];
  return null;
}

function extractDownPayment(userMessage = '', stage = '') {
  const message = normalizeText(userMessage).toLowerCase();
  const compactValue = message.replace(/\s+/g, ' ').trim();
  if (stage === 'collect_down_payment' && /^(?:مفيش|مافيش|معيش|بدون|لا يوجد|صفر|none|no|0+)$/.test(compactValue)) return 0;
  const amount = extractAmountNearKeywords(message, ['مقدم', 'دفعة', 'دفعة اولى', 'دفعة أولى', 'كاش', 'down payment']);
  if (Number.isFinite(amount)) return amount;
  const amounts = extractAllAmounts(message);
  if (stage === 'collect_down_payment' && amounts.length === 1) return amounts[0];
  return null;
}

function extractData(userMessage, stage = '', existingData = {}) {
  const message = normalizeText(userMessage).toLowerCase();
  const amounts = extractAllAmounts(message);

  let income = extractAmountNearKeywords(message, ['دخل', 'راتب', 'مرتب', 'صافي', 'شهري', 'income', 'salary']);
  let propertyValue = extractAmountNearKeywords(message, ['سعر', 'ثمن', 'ميزانية', 'الوحدة', 'العقار', 'الشقة', 'الشقه', 'الفيلا', 'price', 'budget']);
  const maritalStatus = extractMaritalStatus(userMessage);
  const obligations = extractObligations(userMessage, stage);
  const downPayment = extractDownPayment(userMessage, stage);
  const name = extractName(userMessage, stage, existingData);

  if (!income && amounts.length === 1 && stage === 'collect_income') income = amounts[0];
  if (!propertyValue && amounts.length === 1 && stage === 'collect_property_price') propertyValue = amounts[0];

  return { name, maritalStatus, income, obligations, downPayment, propertyValue, phone: extractPhone(message) };
}

function mergeData(existing = {}, captured = {}) {
  return {
    name: captured.name ?? existing.name ?? null,
    maritalStatus: captured.maritalStatus ?? existing.maritalStatus ?? null,
    income: captured.income ?? existing.income ?? null,
    obligations: captured.obligations ?? existing.obligations ?? null,
    downPayment: captured.downPayment ?? existing.downPayment ?? null,
    propertyValue: captured.propertyValue ?? existing.propertyValue ?? null,
    phone: captured.phone ?? existing.phone ?? null
  };
}

function calculateMonthlyInstallment(loanAmount, annualRate, years) {
  if (!Number.isFinite(loanAmount) || loanAmount <= 0) return 0;
  const monthlyRate = annualRate / 12;
  const totalMonths = years * 12;
  if (!monthlyRate) return Math.round(loanAmount / totalMonths);
  const factor = Math.pow(1 + monthlyRate, totalMonths);
  return Math.round((loanAmount * monthlyRate * factor) / (factor - 1));
}

function calculateLoanFromInstallment(maxInstallment, annualRate, years) {
  if (!Number.isFinite(maxInstallment) || maxInstallment <= 0) return 0;
  const monthlyRate = annualRate / 12;
  const totalMonths = years * 12;
  if (!monthlyRate) return Math.round(maxInstallment * totalMonths);
  return Math.round(
    (maxInstallment * (Math.pow(1 + monthlyRate, totalMonths) - 1)) /
    (monthlyRate * Math.pow(1 + monthlyRate, totalMonths))
  );
}

function getFinanceRatioFromBands(bands = [], propertyValue) {
  if (!bands.length) return 0;
  const numericPropertyValue = Number(propertyValue);
  if (!Number.isFinite(numericPropertyValue)) return bands[0].financeRatio;
  const matchedBand = bands.find(
    band => numericPropertyValue >= (band.minPropertyValue ?? 0) &&
            numericPropertyValue <= (band.maxPropertyValue ?? Infinity)
  );
  return matchedBand?.financeRatio ?? bands[bands.length - 1].financeRatio;
}

function getIncomeCap(program, maritalStatus) {
  return maritalStatus === 'married' ? program.incomeCaps.married : program.incomeCaps.single;
}

function calculateSuitableUnitValue(program, downPayment, maxAffordableLoan) {
  const safeDownPayment = Math.max(downPayment || 0, 0);
  const byIncomeAndCash = Math.max(0, safeDownPayment + maxAffordableLoan);
  let bestFit = 0;

  for (const band of program.financeBands || []) {
    const byBandDownPayment = band.financeRatio < 1
      ? Math.floor(safeDownPayment / (1 - band.financeRatio))
      : byIncomeAndCash;
    const candidateUpperBound = Math.min(
      byIncomeAndCash,
      byBandDownPayment,
      band.maxPropertyValue ?? program.maxPropertyValue,
      program.maxPropertyValue
    );
    if (candidateUpperBound >= (band.minPropertyValue ?? program.minPropertyValue)) {
      bestFit = Math.max(bestFit, candidateUpperBound);
    }
  }

  if (bestFit < program.minPropertyValue) return 0;
  return Math.max(0, Math.round(bestFit));
}

function formatPropertyRange(program) {
  if (program.key === '8%') return 'حتى 1,400,000 جنيه';
  return 'من 200,000 إلى 2,000,000 جنيه';
}

function evaluateProgram(data, program) {
  const incomeCap = getIncomeCap(program, data.maritalStatus);
  const financeRatio = program.getFinanceRatio(data.propertyValue);
  const maxInstallment = Math.max(0, Math.round((data.income || 0) * MAX_INSTALLMENT_RATIO - (data.obligations || 0)));
  const maxAffordableLoan = calculateLoanFromInstallment(maxInstallment, program.annualRate, program.maxYears);
  const maxLtvLoan = Math.round((data.propertyValue || 0) * financeRatio);
  const requestedLoan = Math.max((data.propertyValue || 0) - (data.downPayment || 0), 0);
  const availableFinance = Math.max(0, Math.min(maxAffordableLoan, maxLtvLoan));
  const minimumDownPayment = Math.max((data.propertyValue || 0) - maxLtvLoan, 0);
  const requiredDownPayment = Math.max((data.propertyValue || 0) - availableFinance, minimumDownPayment);
  const expectedInstallment = calculateMonthlyInstallment(requestedLoan, program.annualRate, program.maxYears);
  const suitableUnitValue = calculateSuitableUnitValue(program, data.downPayment || 0, maxAffordableLoan);
  const adminFees = Math.round(Math.min(requestedLoan, availableFinance) * program.adminFeeRate);

  const reasons = [];
  const propertyInRange = Number.isFinite(data.propertyValue) &&
    data.propertyValue >= program.minPropertyValue &&
    data.propertyValue <= program.maxPropertyValue;
  const incomeInRange = Number.isFinite(data.income) && data.income <= incomeCap;

  if (!incomeInRange) reasons.push(`الدخل المطلوب للمبادرة دي بحد أقصى ${formatMoney(incomeCap)} جنيه.`);
  if (!propertyInRange) reasons.push(`سعر الوحدة في المبادرة دي لازم يكون ${formatPropertyRange(program)}.`);
  if (maxInstallment <= 0) reasons.push('الالتزامات الحالية مستهلكة الحد الآمن من القسط الشهري.');
  if ((data.downPayment || 0) < minimumDownPayment) reasons.push(`المقدم المطلوب يبدأ من ${formatMoney(minimumDownPayment)} جنيه.`);
  if (requestedLoan > maxAffordableLoan) reasons.push('القسط المتوقع أعلى من 40% من صافي الدخل بعد خصم الالتزامات.');

  const isEligible = propertyInRange && incomeInRange && maxInstallment > 0 &&
    (data.downPayment || 0) >= minimumDownPayment &&
    requestedLoan <= maxAffordableLoan &&
    requestedLoan <= maxLtvLoan;

  return {
    program, incomeCap, financeRatio, maxInstallment, maxAffordableLoan,
    maxLtvLoan, availableFinance, requestedLoan, expectedInstallment,
    minimumDownPayment, requiredDownPayment, suitableUnitValue, adminFees,
    isEligible, reasons
  };
}

function pickBestEvaluation(data) {
  const evaluations = PROGRAMS.map(p => evaluateProgram(data, p));
  const eligible = evaluations.filter(e => e.isEligible);
  if (eligible.length > 0) return eligible.sort((a, b) => a.program.annualRate - b.program.annualRate)[0];
  return evaluations.sort((a, b) => {
    if (a.reasons.length !== b.reasons.length) return a.reasons.length - b.reasons.length;
    return a.program.annualRate - b.program.annualRate;
  })[0];
}

function getFirstName(name = '') {
  return normalizeText(name).split(' ')[0] || 'حضرتك';
}

function resolveNextStep(data = {}) {
  if (!data.name) return 'collect_name';
  if (!data.maritalStatus) return 'collect_marital_status';
  if (!Number.isFinite(data.income)) return 'collect_income';
  if (!Number.isFinite(data.obligations)) return 'collect_obligations';
  if (!Number.isFinite(data.propertyValue)) return 'collect_property_price';
  if (!Number.isFinite(data.downPayment)) return 'collect_down_payment';
  if (!data.phone) return 'collect_phone';
  return 'lead_saved';
}

function buildResponse(reply, nextStep, cta, intent = 'mortgage_info') {
  const cleanReply = String(reply || '').trim();
  const cleanCta = String(cta || '').trim();
  return {
    reply: cleanReply.endsWith(cleanCta) ? cleanReply : `${cleanReply}\n${cleanCta}`.trim(),
    intent,
    next_step: nextStep,
    cta: cleanCta
  };
}

// ─── التحقق من المقدم: بين 5% و20% من سعر الوحدة ───────────────────────────
function validateDownPaymentRatio(downPayment, propertyValue) {
  if (!Number.isFinite(downPayment) || !Number.isFinite(propertyValue) || propertyValue <= 0) return null;
  const ratio = downPayment / propertyValue;
  const minDP = Math.round(propertyValue * MIN_DOWN_PAYMENT_RATIO);
  const maxDP = Math.round(propertyValue * MAX_DOWN_PAYMENT_RATIO);

  if (ratio < MIN_DOWN_PAYMENT_RATIO) {
    return {
      valid: false,
      message: `المقدم المطلوب يكون على الأقل 5% من سعر الوحدة.
      \nبما إن سعر الوحدة ${formatMoney(propertyValue)} جنيه، أقل مقدم مقبول هو ${formatMoney(minDP)} جنيه.
      \nاكتب المقدم تاني من ${formatMoney(minDP)} إلى ${formatMoney(maxDP)} جنيه 👇 
      \n   أو تختار وحدة بسعر أقل.`
    };
  }

  if (ratio > MAX_DOWN_PAYMENT_RATIO) {
    return {
      valid: false,
      message: `المقدم لا يتجاوز 20% من سعر الوحدة.\nبما إن سعر الوحدة ${formatMoney(propertyValue)} جنيه، أقصى مقدم مقبول هو ${formatMoney(maxDP)} جنيه.\nاكتب المقدم تاني بحد أقصى ${formatMoney(maxDP)} جنيه 👇`
    };
  }

  return { valid: true };
}

function buildQuestionResponse(data = {}, capturedData = {}, stage = '') {
  const firstName = getFirstName(data.name);
  const nextStep = resolveNextStep(data);

  if (nextStep === 'collect_name') {
    return buildResponse('ممكن أعرف اسم حضرتك؟', 'collect_name', 'اكتب اسم حضرتك عشان نكمل خطوة خطوة 👇');
  }

  if (nextStep === 'collect_marital_status') {
    const greeting = capturedData.name && stage === 'collect_name'
      ? `أهلاً يا ${firstName} 👋 نورتنا!`
      : `تمام يا ${firstName}.`;
    return buildResponse(
      `${greeting}\nممكن أعرف حالتك الاجتماعية؟ (أعزب / متزوج)`,
      'collect_marital_status',
      'اكتب أعزب أو متزوج 👇'
    );
  }

  if (nextStep === 'collect_income') {
    return buildResponse(
      `تمام يا ${firstName}.\nما هو صافي دخلك الشهري؟`,
      'collect_income',
      'اكتب صافي الدخل الشهري بالجنيه 👇'
    );
  }

  if (nextStep === 'collect_obligations') {
     const evaluation = pickBestEvaluation(data);
    const statusLine = evaluation.isEligible
    return buildResponse(
      `صافي دخلك المسجل ${formatMoney(data.income)} جنيه.
      \n نوع المبادرة الأنسب ليك: ${evaluation.program.label}.

      \nهل لديك التزامات أو أقساط حالية؟`,
      'collect_obligations',
      'اكتب قيمة الأقساط الحالية أو اكتب 0 لو مفيش 👇'
    );
  }

  // ترتيب جديد: سعر الوحدة أولاً ثم المقدم
  if (nextStep === 'collect_property_price') {
    const maxInstallment = Math.max(0, Math.round((data.income || 0) * MAX_INSTALLMENT_RATIO - (data.obligations || 0)));
    return buildResponse(
      `تمام.\nالحد الأقصى الآمن للقسط الجديد عندك تقريباً ${formatMoney(maxInstallment)} جنيه شهرياً.\nما سعر الوحدة السكنية المتوقع؟`,
      'collect_property_price',
      'اكتب سعر الوحدة المتوقع بالجنيه 👇'
    );
  }

  if (nextStep === 'collect_down_payment') {
    const minDP = Math.round((data.propertyValue || 0) * MIN_DOWN_PAYMENT_RATIO);
    const maxDP = Math.round((data.propertyValue || 0) * MAX_DOWN_PAYMENT_RATIO);
    return buildResponse(
      `سعر الوحدة المسجل ${formatMoney(data.propertyValue)} جنيه.\nهل لديك مقدم؟ المقدم المطلوب يكون بين ${formatMoney(minDP)} و${formatMoney(maxDP)} جنيه (15% إلى 20% من سعر الوحدة).`,
      'collect_down_payment',
      `اكتب قيمة المقدم بين ${formatMoney(minDP)} و${formatMoney(maxDP)} جنيه 👇`
    );
  }

  return null;
}

function buildValidationResponse(stage, data = {}) {
  const firstName = getFirstName(data.name);

  if (stage === 'collect_name') {
    return buildResponse('ممكن أعرف اسم حضرتك؟', 'collect_name', 'اكتب اسم حضرتك بشكل واضح 👇');
  }
  if (stage === 'collect_marital_status') {
    return buildResponse(
      `أهلاً يا ${firstName} 👋 نورتنا!\nممكن أعرف حالتك الاجتماعية؟ (أعزب / متزوج)`,
      'collect_marital_status',
      'اكتب أعزب أو متزوج فقط 👇'
    );
  }
  if (stage === 'collect_income') {
    return buildResponse(
      `تمام يا ${firstName}.\nما هو صافي دخلك الشهري؟ (اكتب الرقم بالجنيه)`,
      'collect_income',
      'اكتب دخل صحيح أكبر من صفر 👇'
    );
  }
  if (stage === 'collect_obligations') {
    return buildResponse(
      'هل لديك التزامات أو أقساط حالية؟ (اكتب الرقم أو 0 لو مفيش)',
      'collect_obligations',
      'اكتب رقم صحيح أكبر من أو يساوي صفر 👇'
    );
  }
  if (stage === 'collect_property_price') {
    return buildResponse(
      'ما سعر الوحدة السكنية المتوقع؟ (اكتب الرقم بالجنيه)',
      'collect_property_price',
      'اكتب سعر وحدة صحيح أكبر من صفر 👇'
    );
  }
  if (stage === 'collect_down_payment') {
    const minDP = Math.round((data.propertyValue || 0) * MIN_DOWN_PAYMENT_RATIO);
    const maxDP = Math.round((data.propertyValue || 0) * MAX_DOWN_PAYMENT_RATIO);
    return buildResponse(
      `المقدم يجب أن يكون بين ${formatMoney(minDP)} و${formatMoney(maxDP)} جنيه\n(بين 5% و20% من سعر الوحدة)`,
      'collect_down_payment',
      `اكتب المقدم بين ${formatMoney(minDP)} و${formatMoney(maxDP)} جنيه 👇`
    );
  }
  return buildResponse('ما سعر الوحدة السكنية المتوقع؟', 'collect_property_price', 'اكتب سعر وحدة صحيح أكبر من صفر 👇');
}

function validateStepInput(stage, userMessage, capturedData, mergedData) {
  if (['collect_income', 'collect_obligations', 'collect_down_payment', 'collect_property_price'].includes(stage)) {
    if (hasNegativeNumber(userMessage)) return buildValidationResponse(stage, mergedData);
  }
  if (stage === 'collect_name' && !capturedData.name && !mergedData.name) return buildValidationResponse(stage, mergedData);
  if (stage === 'collect_marital_status' && !capturedData.maritalStatus && !mergedData.maritalStatus) return buildValidationResponse(stage, mergedData);
  if (stage === 'collect_income' && (!Number.isFinite(capturedData.income) || capturedData.income <= 0)) return buildValidationResponse(stage, mergedData);
  if (stage === 'collect_obligations' && !Number.isFinite(capturedData.obligations)) return buildValidationResponse(stage, mergedData);
  if (stage === 'collect_property_price' && (!Number.isFinite(capturedData.propertyValue) || capturedData.propertyValue <= 0)) return buildValidationResponse(stage, mergedData);
  if (stage === 'collect_down_payment') {
    if (!Number.isFinite(capturedData.downPayment)) return buildValidationResponse(stage, mergedData);
    // التحقق من نسبة 5%-20%
    const dpValidation = validateDownPaymentRatio(capturedData.downPayment, mergedData.propertyValue);
    if (dpValidation && !dpValidation.valid) {
      return buildResponse(dpValidation.message, 'collect_down_payment', '', 'mortgage_info');
    }
  }
  return null;
}

function buildAdvice(evaluation, data) {
  if (evaluation.isEligible) {
    if ((data.obligations || 0) > 0) return 'وضعك المبدئي جيد، فقط حافظ إن الالتزامات الحالية ما تزيدش أثناء التقديم.';
    if ((data.downPayment || 0) <= evaluation.requiredDownPayment + 50_000) return 'أنت قريب جداً من أفضل سيناريو، وزيادة بسيطة في المقدم قد تديك راحة أكبر في القسط.';
    return 'أنت مؤهل مبدئياً بشكل جيد، والأفضل تجهز مستندات الدخل والبطاقة قبل التقديم.';
  }
  if ((data.downPayment || 0) < evaluation.requiredDownPayment) return `لو قدرت تزود المقدم إلى حوالي ${formatMoney(evaluation.requiredDownPayment)} جنيه هتبقى فرصتك أفضل.`;
  if (evaluation.maxInstallment <= 0) return 'الأفضل تقلل الالتزامات الحالية أو تختار وحدة بسعر أقل قبل التقديم.';
  return `الأنسب ليك حاليًا وحدة في حدود ${formatMoney(evaluation.suitableUnitValue)} جنيه أو أقل.`;
}

function buildQualificationResponse(data = {}) {
  const evaluation = pickBestEvaluation(data);
  const statusLine = evaluation.isEligible
    ? `- مؤهل مبدئيًا على ${evaluation.program.label}.`
    : `- حاليًا غير مؤهل بالشكل المطلوب على ${evaluation.program.label}.`;
  const affordabilityLine = !evaluation.isEligible && Number.isFinite(data.propertyValue) &&
    evaluation.suitableUnitValue > 0 && data.propertyValue > evaluation.suitableUnitValue
    ? '- الوحدة الحالية أعلى من قدرتك المالية.'
    : null;
  const requestedUnitInstallment = calculateMonthlyInstallment(
    evaluation.requestedLoan, evaluation.program.annualRate, evaluation.program.maxYears
  );

  return buildResponse(
    [
      `بص يا ${getFirstName(data.name)} 👋 خليني ألخصهالك ببساطة:`,
      statusLine,
      affordabilityLine,
      `- نوع المبادرة الأنسب ليك: ${evaluation.program.label}.`,
      `- أقصى قسط مناسب ليك بعد خصم الالتزامات: ${formatMoney(evaluation.maxInstallment)} جنيه شهرياً تقريبا.`,
      evaluation.availableFinance > 0
        ? `- قيمة التمويل المتاحة تقريبياً: ${formatMoney(evaluation.availableFinance)} جنيه على مدة تصل إلى ${evaluation.program.maxYears} سنة.`
        : '- لا يوجد تمويل متاح حاليًا على نفس الوحدة بالبيانات الحالية.',
      `- المقدم المطلوب للوحدة المستهدفة: ${formatMoney(evaluation.requiredDownPayment)} جنيه تقريبا.`,
      `- القسط المتوقع على وحدتك الحالية: ${formatMoney(requestedUnitInstallment)} جنيه شهرياً تقريبا.`,
      evaluation.suitableUnitValue > 0
        ? `- أقصى سعر وحدة مناسب ليك حالياً: حوالي ${formatMoney(evaluation.suitableUnitValue)} جنيه تقريبا.`
        : '- تحتاج مقدم أعلى أو التزامات أقل قبل ما نحدد سعر وحدة مناسب بشكل منطقي.',
      evaluation.adminFees > 0 ? `- المصروفات الإدارية التقريبية: ${formatMoney(evaluation.adminFees)} جنيه.` : null,
      `- نصيحتي: ${buildAdvice(evaluation, data)}`,
      '- رشحت لك شقتين مناسبين لمستواك المالي في البطاقات الظاهرة أسفل الرسالة.'
    ].filter(Boolean).join('\n'),
    'collect_phone',
    'لو تحب نكمل الطلب ونرشح لك وحدات مناسبة، ابعت رقم موبايلك 👇',
    'lead_capture'
  );
}

function buildPhoneCapturedResponse(data = {}) {
  const evaluation = pickBestEvaluation(data);
  return buildResponse(
    [
      `تمام يا ${getFirstName(data.name)}، ✅`,
      `- المبادرة الأنسب ليك حاليًا: ${evaluation.program.label}.`,
      `- التمويل المتاح تقريبياً: ${formatMoney(evaluation.availableFinance)} جنيه.`,
      `- القسط المتوقع على السيناريو الحالي: ${formatMoney(evaluation.expectedInstallment)} جنيه شهرياً.`,
      `- فريقنا هيتواصل معاك ويكمل معاك الترشيحات والخطوات.`
    ].join('\n'),
    'lead_saved',
    '',
    'lead_capture'
  );
}

async function getChatResponse({ userMessage, sessionData = {}, stage = 'collect_name' }) {
  const capturedData = extractData(userMessage, stage, sessionData);
  const mergedData = mergeData(sessionData, capturedData);
  const validationError = validateStepInput(stage, userMessage, capturedData, mergedData);

  if (validationError) return { ...validationError, dataCaptured: {} };

  const nextStep = resolveNextStep(mergedData);

  // لو المقدم يغطي سعر الوحدة بالكامل
  if (Number.isFinite(mergedData.propertyValue) && Number.isFinite(mergedData.downPayment)) {
    const requestedLoan = mergedData.propertyValue - mergedData.downPayment;
    if (requestedLoan <= 0) {
      return {
        ...buildResponse(
          [
            `تمام يا ${getFirstName(mergedData.name)}.`,
            '- من الأرقام اللي كتبتها، المقدم الحالي يغطي سعر الوحدة بالكامل.',
            '- في الحالة دي أنت لا تحتاج تمويل عقاري على الوحدة الحالية.'
          ].join('\n'),
          'collect_phone',
          'لو تحب نكمل معاك ونرشح لك وحدات مناسبة، ابعت رقم موبايلك 👇',
          'lead_capture'
        ),
        dataCaptured: capturedData
      };
    }
  }

  if (nextStep !== 'collect_phone' && nextStep !== 'lead_saved') {
    return { ...buildQuestionResponse(mergedData, capturedData, stage), dataCaptured: capturedData };
  }

  if (nextStep === 'collect_phone') {
    return { ...buildQualificationResponse(mergedData), dataCaptured: capturedData };
  }

  return { ...buildPhoneCapturedResponse(mergedData), dataCaptured: capturedData };
}

export { getChatResponse, extractPhone };
