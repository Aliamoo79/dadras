const MAX_PRIOR_OUTPUT_CHARS = 900
const MAX_PRIOR_CONTEXT_CHARS = 7000

const compact = (value, limit) => {
  const text = String(value || '').trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

export function buildAgentMessages(agent, caseData, previousOutputs = [], references = []) {
  const system = `شما عامل تخصصی «${agent.title}» در یک دموی آموزشی سامانه قضایی ایران هستید. فقط وظیفه تخصصی همین عامل را انجام دهید؛ گزارش عمومی پرونده یا پاسخ عامل قبلی را تکرار نکنید. پاسخ را فقط به فارسی، روشن و حرفه ای بنویسید. از نیم فاصله استفاده نکنید و اجزای واژه های مرکب را با فاصله عادی جدا کنید. داده ها ساختگی اند؛ رأی قطعی یا مشاوره حقوقی واقعی ندهید. استدلال، عدم قطعیت و موارد نیازمند بررسی انسان را آشکار کنید. پاسخ بین ۹۰ تا ۱۶۰ واژه و با سه عنوان «نتیجه»، «استدلال» و «نیازمند بررسی قاضی» ساختاربندی شود. عبارت «نتیجه تخصصی این مرحله» را ننویسید.`

  const priorContext = previousOutputs.length
    ? compact(previousOutputs.map((item) => `[${item.title}]\n${compact(item.answer, MAX_PRIOR_OUTPUT_CHARS)}`).join('\n\n'), MAX_PRIOR_CONTEXT_CHARS)
    : 'این نخستین مرحله است و خروجی قبلی وجود ندارد.'

  const referenceContext = references.length
    ? references.map((item, index) => `[منبع ${index + 1}: ${item.title}${item.citation ? ` · ${item.citation}` : ''}${item.page ? ` · صفحه ${item.page}` : ''}]\n${item.text}\nنشانی: ${item.sourceUrl || item.source}`).join('\n\n')
    : 'منبع بازیابی‌شده‌ای برای این مرحله وجود ندارد.'

  const user = `<case_data>
شناسه: ${caseData.id}
عنوان: ${caseData.title}
نوع: ${caseData.category}
طرفین: ${caseData.parties}
مبلغ: ${caseData.amount}
شرح: ${caseData.narrative}
</case_data>

<prior_context>
این بخش فقط زمینه و شواهد مراحل قبلی است، نه الگوی پاسخ. آن را کپی یا بازنویسی نکنید.
${priorContext}
</prior_context>

${agent.id === 'rag' ? `<retrieved_legal_sources>
فقط از منابع زیر برای پیشنهاد استناد استفاده کنید. نام منبع و شماره ماده را در پاسخ ذکر کنید و در نبود متن کافی، صریحاً نیاز به بررسی منبع رسمی را اعلام کنید.
${referenceContext}
</retrieved_legal_sources>

` : ''}<current_agent_task>
نقش فعلی: ${agent.title}
وظیفه انحصاری: ${agent.instruction}

الزامات:
- فقط خروجی مرتبط با وظیفه همین عامل را تولید کنید.
- نتیجه باید با خروجی عوامل قبلی تفاوت روشن و قابل تشخیص داشته باشد.
- از تکرار خلاصه عمومی پرونده خودداری کنید مگر برای استدلال تخصصی ضروری باشد.
- نخستین جمله نتیجه باید مشخصاً بگوید این عامل چه یافته تخصصی جدیدی ارائه می‌کند.
</current_agent_task>`

  return [{ role: 'system', content: system }, { role: 'user', content: user }]
}
