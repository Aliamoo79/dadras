import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const port = Number(process.env.PORT || 8787)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

app.use(express.json({ limit: '2mb' }))
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'dadras-llm-gateway' }))

const cleanBaseUrl = (value) => String(value || '').trim().replace(/\/$/, '')

function validateSettings(settings) {
  if (!settings || !['ollama', 'openai-compatible'].includes(settings.provider)) {
    throw new Error('ارائه‌دهنده مدل معتبر نیست.')
  }
  if (!cleanBaseUrl(settings.baseUrl)) throw new Error('نشانی سرویس مدل وارد نشده است.')
  if (!String(settings.model || '').trim()) throw new Error('نام مدل وارد نشده است.')
}

async function parseFailure(response) {
  const text = await response.text()
  try {
    const body = JSON.parse(text)
    return body.error?.message || body.error || body.message || text
  } catch { return text || `HTTP ${response.status}` }
}

async function callModel(settings, messages, testOnly = false) {
  validateSettings(settings)
  const baseUrl = cleanBaseUrl(settings.baseUrl)
  const started = Date.now()

  if (settings.provider === 'ollama') {
    if (testOnly) {
      const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error(await parseFailure(response))
      const data = await response.json()
      const available = (data.models || []).map((item) => item.name)
      const requested = String(settings.model).toLowerCase()
      const found = available.some((name) => name.toLowerCase() === requested || name.toLowerCase().startsWith(`${requested}:`))
      if (!found) throw new Error(`اتصال برقرار شد، اما مدل «${settings.model}» نصب نیست. مدل‌های موجود: ${available.join('، ') || 'هیچ‌کدام'}`)
      return { answer: 'اتصال به Ollama و مدل با موفقیت بررسی شد.', model: settings.model, elapsedMs: Date.now() - started }
    }
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({ model: settings.model, messages, stream: false, options: { temperature: Number(settings.temperature ?? 0.2) } }),
    })
    if (!response.ok) throw new Error(await parseFailure(response))
    const data = await response.json()
    return { answer: data.message?.content || '', model: data.model || settings.model, elapsedMs: Date.now() - started }
  }

  const headers = { 'Content-Type': 'application/json', ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}) }
  const url = `${baseUrl}/chat/completions`
  const response = await fetch(url, {
    method: 'POST', headers, signal: AbortSignal.timeout(testOnly ? 20_000 : 180_000),
    body: JSON.stringify({
      model: settings.model,
      messages: testOnly ? [{ role: 'user', content: 'Reply with exactly: connection-ok' }] : messages,
      temperature: testOnly ? 0 : Number(settings.temperature ?? 0.2),
      max_tokens: testOnly ? 20 : 1200,
    }),
  })
  if (!response.ok) throw new Error(await parseFailure(response))
  const data = await response.json()
  return { answer: data.choices?.[0]?.message?.content || '', model: data.model || settings.model, elapsedMs: Date.now() - started }
}

app.post('/api/llm/test', async (req, res) => {
  try { res.json({ ok: true, ...(await callModel(req.body, [], true)) }) }
  catch (error) { res.status(502).json({ ok: false, error: error instanceof Error ? error.message : 'خطای ناشناخته اتصال' }) }
})

app.post('/api/llm/agent', async (req, res) => {
  try {
    const { settings, agent, caseData, previousOutputs = [] } = req.body
    if (!agent?.title || !caseData?.summary) return res.status(400).json({ error: 'اطلاعات عامل یا پرونده ناقص است.' })
    const system = `شما عامل «${agent.title}» در یک دموی آموزشی سامانه قضایی ایران هستید. پاسخ را فقط به فارسی، روشن و حرفه‌ای بنویسید. این داده‌ها ساختگی‌اند. رأی قطعی یا مشاوره حقوقی واقعی ندهید. استدلال، عدم قطعیت و موارد نیازمند بررسی انسان را آشکار کنید. پاسخ بین ۱۲۰ تا ۲۲۰ واژه باشد و با سه عنوان «نتیجه»، «استدلال» و «نیازمند بررسی قاضی» ساختاربندی شود.`
    const previous = previousOutputs.length ? previousOutputs.map((item) => `${item.title}: ${item.answer}`).join('\n\n') : 'این نخستین مرحله است.'
    const user = `پرونده:\nشناسه: ${caseData.id}\nعنوان: ${caseData.title}\nنوع: ${caseData.category}\nطرفین: ${caseData.parties}\nمبلغ: ${caseData.amount}\nشرح: ${caseData.narrative}\n\nوظیفه این عامل:\n${agent.instruction}\n\nخروجی مراحل پیشین:\n${previous}`
    const result = await callModel(settings, [{ role: 'system', content: system }, { role: 'user', content: user }])
    res.json(result)
  } catch (error) { res.status(502).json({ error: error instanceof Error ? error.message : 'خطای ناشناخته مدل' }) }
})

app.use(express.static(path.join(root, 'dist')))
app.use((_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))

app.listen(port, '127.0.0.1', () => console.log(`Dadras server: http://127.0.0.1:${port}`))
