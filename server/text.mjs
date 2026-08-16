const allowedCharacter = /[\p{Script=Arabic}\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u

export function normalizePersianTypography(value) {
  return String(value || '')
    .replace(/نتیجه تخصصی این مرحله/gu, 'نتیجه')
    .replace(/صورت\s*[-‌]?\s*وضعیت\s*های(?=$|[^\p{Script=Arabic}])/gu, 'صورت‌وضعیت‌های')
    .replace(/صورت\s*[-‌]?\s*وضعیت\s*ها(?=$|[^\p{Script=Arabic}])/gu, 'صورت‌وضعیت‌ها')
    .replace(/صورت\s*[-‌]?\s*وضعیت/gu, 'صورت‌وضعیت')
    .replace(/صورت\s*[-‌]?\s*جلسه/gu, 'صورت‌جلسه')
    .replace(/پیش\s*[-‌]?\s*پرداخت/gu, 'پیش‌پرداخت')
    .replace(/لازم\s*[-‌]?\s*الاتباع/gu, 'لازم‌الاتباع')
    .replace(/قائم\s*[-‌]?\s*مقام/gu, 'قائم‌مقام')
    .replace(/حق\s*[-‌]?\s*(الزحمه|الوکاله)/gu, 'حق‌$1')
    .replace(/(دسته|طبقه|رده|اولویت|زمان|مرحله|قیمت|جمع)\s*[-‌]?\s*بندی/gu, '$1‌بندی')
    .replace(/(تصمیم|نتیجه)\s*[-‌]?\s*گیری/gu, '$1‌گیری')
    .replace(/(قانون|سیاست|قیمت|نام)\s*[-‌]?\s*گذاری/gu, '$1‌گذاری')
    .replace(/برنامه\s*[-‌]?\s*ریزی/gu, 'برنامه‌ریزی')
    .replace(/پیش\s*[-‌]?\s*بینی/gu, 'پیش‌بینی')
    .replace(/بهره\s*[-‌]?\s*برداری/gu, 'بهره‌برداری')
    .replace(/لازم\s*[-‌]?\s*الاجرا/gu, 'لازم‌الاجرا')
    .replace(/(قرارداد|دادگاه|پیمان|هزینه|خسارت|تعهد|سند|مدرک|طرف|ماده|پرونده)(های|ها)(?=$|[^\p{Script=Arabic}])/gu, '$1‌$2')
    .replace(/(^|[^\p{Script=Arabic}])(ن?می)(باشد|شود|کند|تواند|دهد|گردد|گیرد)(?=$|[^\p{Script=Arabic}])/gu, '$1$2‌$3')
}

export function sanitizeModelText(value) {
  const clean = [...String(value || '').normalize('NFKC')]
    .filter((character) => allowedCharacter.test(character))
    .join('')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\uFFFD/g, '')
  return normalizePersianTypography(clean).replace(/\u200c/g, ' ')
}
