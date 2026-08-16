import express from 'express'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const app = express()
const port = Number(process.env.PORT || 8787)
const host = String(process.env.HOST || '127.0.0.1')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MAX_LOGS = 500
const logs = []

const redactUrl = (value) => {
  try {
    const url = new URL(String(value))
    url.username = ''
    url.password = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/key|token|secret|auth/i.test(key)) url.searchParams.set(key, '[REDACTED]')
    }
    return url.toString()
  } catch { return String(value || '') }
}

function addLog(level, event, details = {}) {
  const entry = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), level, event, ...details }
  logs.unshift(entry)
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](JSON.stringify(entry))
  return entry
}

app.use(express.json({ limit: '2mb' }))
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'dadras-llm-gateway' }))
app.use('/api', (req, res, next) => {
  req.requestId = crypto.randomUUID()
  res.setHeader('X-Request-Id', req.requestId)
  const started = Date.now()
  res.on('finish', () => {
    if (!req.path.startsWith('/logs')) addLog(res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', 'http_request', {
      requestId: req.requestId, method: req.method, path: req.originalUrl, status: res.statusCode, elapsedMs: Date.now() - started,
    })
  })
  next()
})

app.get('/api/logs', (req, res) => {
  const level = String(req.query.level || 'all')
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), MAX_LOGS)
  const filtered = level === 'all' ? logs : logs.filter((entry) => entry.level === level)
  res.json({ logs: filtered.slice(0, limit), total: filtered.length, capacity: MAX_LOGS })
})

app.delete('/api/logs', (_req, res) => {
  const cleared = logs.length
  logs.length = 0
  addLog('info', 'logs_cleared', { cleared })
  res.json({ ok: true, cleared })
})

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
    return { message: body.error?.message || body.error || body.message || text, body }
  } catch { return { message: text || `HTTP ${response.status}`, body: text } }
}

async function callModel(settings, messages, testOnly = false, context = {}) {
  validateSettings(settings)
  const baseUrl = cleanBaseUrl(settings.baseUrl)
  const started = Date.now()
  const operation = testOnly ? 'connection_test' : 'agent_completion'
  const fetchModel = async (url, options) => {
    try {
      const response = await fetch(url, options)
      if (!response.ok) {
        const failure = await parseFailure(response)
        const error = new Error(String(failure.message || `HTTP ${response.status}`))
        error.status = response.status
        error.upstreamBody = failure.body
        throw error
      }
      return response
    } catch (error) {
      addLog('error', 'model_request_failed', {
        ...context, operation, provider: settings.provider, model: settings.model,
        endpoint: redactUrl(url), elapsedMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : 'UnknownError',
        upstreamStatus: error?.status, upstreamBody: error?.upstreamBody,
      })
      throw error
    }
  }

  if (settings.provider === 'ollama') {
    if (testOnly) {
      const response = await fetchModel(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(10_000) })
      const data = await response.json()
      const available = (data.models || []).map((item) => item.name)
      const requested = String(settings.model).toLowerCase()
      const found = available.some((name) => name.toLowerCase() === requested || name.toLowerCase().startsWith(`${requested}:`))
      if (!found) throw new Error(`اتصال برقرار شد، اما مدل «${settings.model}» نصب نیست. مدل‌های موجود: ${available.join('، ') || 'هیچ‌کدام'}`)
      return { answer: 'اتصال به Ollama و مدل با موفقیت بررسی شد.', model: settings.model, elapsedMs: Date.now() - started }
    }
    const response = await fetchModel(`${baseUrl}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({ model: settings.model, messages, stream: false, options: { temperature: Number(settings.temperature ?? 0.2) } }),
    })
    const data = await response.json()
    if (!data.message?.content) throw new Error('مدل پاسخ متنی معتبری برنگرداند.')
    addLog('info', 'model_request_succeeded', { ...context, operation, provider: settings.provider, model: data.model || settings.model, elapsedMs: Date.now() - started })
    return { answer: data.message?.content || '', model: data.model || settings.model, elapsedMs: Date.now() - started }
  }

  const headers = { 'Content-Type': 'application/json', ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}) }
  const url = `${baseUrl}/chat/completions`
  const response = await fetchModel(url, {
    method: 'POST', headers, signal: AbortSignal.timeout(testOnly ? 20_000 : 180_000),
    body: JSON.stringify({
      model: settings.model,
      messages: testOnly ? [{ role: 'user', content: 'Reply with exactly: connection-ok' }] : messages,
      temperature: testOnly ? 0 : Number(settings.temperature ?? 0.2),
      max_tokens: testOnly ? 20 : 1200,
    }),
  })
  const data = await response.json()
  if (!data.choices?.[0]?.message?.content) throw new Error('ساختار پاسخ API معتبر نیست: choices[0].message.content یافت نشد.')
  addLog('info', 'model_request_succeeded', { ...context, operation, provider: settings.provider, model: data.model || settings.model, elapsedMs: Date.now() - started })
  return { answer: data.choices?.[0]?.message?.content || '', model: data.model || settings.model, elapsedMs: Date.now() - started }
}

app.post('/api/llm/test', async (req, res) => {
  try { res.json({ ok: true, ...(await callModel(req.body, [], true, { requestId: req.requestId })) }) }
  catch (error) {
    addLog('error', 'connection_test_failed', { requestId: req.requestId, provider: req.body?.provider, model: req.body?.model, error: error instanceof Error ? error.message : String(error) })
    res.status(502).json({ ok: false, requestId: req.requestId, error: error instanceof Error ? error.message : 'خطای ناشناخته اتصال' })
  }
})

app.post('/api/llm/agent', async (req, res) => {
  try {
    const { settings, agent, caseData, previousOutputs = [] } = req.body
    if (!agent?.title || !caseData?.summary) return res.status(400).json({ error: 'اطلاعات عامل یا پرونده ناقص است.' })
    const system = `شما عامل «${agent.title}» در یک دموی آموزشی سامانه قضایی ایران هستید. پاسخ را فقط به فارسی، روشن و حرفه‌ای بنویسید. این داده‌ها ساختگی‌اند. رأی قطعی یا مشاوره حقوقی واقعی ندهید. استدلال، عدم قطعیت و موارد نیازمند بررسی انسان را آشکار کنید. پاسخ بین ۱۲۰ تا ۲۲۰ واژه باشد و با سه عنوان «نتیجه»، «استدلال» و «نیازمند بررسی قاضی» ساختاربندی شود.`
    const previous = previousOutputs.length ? previousOutputs.map((item) => `${item.title}: ${item.answer}`).join('\n\n') : 'این نخستین مرحله است.'
    const user = `پرونده:\nشناسه: ${caseData.id}\nعنوان: ${caseData.title}\nنوع: ${caseData.category}\nطرفین: ${caseData.parties}\nمبلغ: ${caseData.amount}\nشرح: ${caseData.narrative}\n\nوظیفه این عامل:\n${agent.instruction}\n\nخروجی مراحل پیشین:\n${previous}`
    const result = await callModel(settings, [{ role: 'system', content: system }, { role: 'user', content: user }], false, { requestId: req.requestId, agent: agent.title, caseId: caseData.id })
    res.json(result)
  } catch (error) {
    addLog('error', 'agent_request_failed', { requestId: req.requestId, agent: req.body?.agent?.title, caseId: req.body?.caseData?.id, model: req.body?.settings?.model, error: error instanceof Error ? error.message : String(error) })
    res.status(502).json({ requestId: req.requestId, error: error instanceof Error ? error.message : 'خطای ناشناخته مدل' })
  }
})

app.use('/api', (error, req, res, _next) => {
  addLog('error', 'unhandled_api_error', { requestId: req.requestId, method: req.method, path: req.originalUrl, error: error instanceof Error ? error.message : String(error) })
  const oversized = error?.status === 413
  res.status(oversized ? 413 : 500).json({ requestId: req.requestId, error: oversized ? 'حجم درخواست بیش از حد مجاز است.' : 'خطای داخلی سرور' })
})

app.use(express.static(path.join(root, 'dist')))
app.use((_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))

app.listen(port, host, () => console.log(`Dadras server listening on http://${host}:${port}`))
