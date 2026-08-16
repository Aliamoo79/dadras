import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const normalize = (value) => String(value || '').normalize('NFKC')
  .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim()

export function buildUploadedCaseData({ filename, text, pages }) {
  const cleanText = normalize(text)
  if (cleanText.length < 80) throw new Error('متن قابل استفاده‌ای از PDF استخراج نشد؛ فایل ممکن است اسکن‌شده باشد و به OCR نیاز دارد.')
  const title = String(filename || 'پرونده بارگذاری‌شده').replace(/\.pdf$/i, '').trim()
  return {
    id: `UP-${Date.now().toString(36).toUpperCase()}`,
    title,
    category: 'پرونده بارگذاری‌شده',
    branch: 'مرجع رسیدگی نامشخص',
    urgency: 'نیازمند بررسی',
    amount: 'از متن پرونده استخراج شود',
    parties: 'از متن پرونده استخراج شود',
    filedAt: new Intl.DateTimeFormat('fa-IR').format(new Date()),
    summary: `فایل «${title}» در ${pages} صفحه بارگذاری شد. ${cleanText.slice(0, 900)}`,
    narrative: cleanText.slice(0, 24_000),
  }
}

export async function extractPdfCase(buffer, filename) {
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise
  const pages = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    pages.push(`[صفحه ${pageNumber}] ${content.items.map((item) => item.str).join(' ')}`)
  }
  return buildUploadedCaseData({ filename, text: pages.join('\n'), pages: pdf.numPages })
}
