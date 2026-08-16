import express from 'express'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { buildAgentMessages } from './prompts.mjs'
import { listKnowledgeDocuments, saveKnowledgeDocument, searchKnowledge } from './knowledge.mjs'
import { sanitizeModelText } from './text.mjs'

const app = express()
const port = Number(process.env.PORT || 8787)
const host = String(process.env.HOST || '127.0.0.1')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MAX_LOGS = 500
const MODEL_REQUEST_TIMEOUT_MS = 180_000
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

app.get('/api/knowledge', async (_req, res, next) => {
  try { res.json({ documents: await listKnowledgeDocuments() }) } catch (error) { next(error) }
})

app.post('/api/knowledge', async (req, res, next) => {
  try { res.status(201).json({ ok: true, document: await saveKnowledgeDocument(req.body?.title, req.body?.content) }) }
  catch (error) { next(error) }
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
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
      body: JSON.stringify({ model: settings.model, messages, stream: false, options: { temperature: Number(settings.temperature ?? 0.2) } }),
    })
    const data = await response.json()
    if (!data.message?.content) throw new Error('مدل پاسخ متنی معتبری برنگرداند.')
    addLog('info', 'model_request_succeeded', { ...context, operation, provider: settings.provider, model: data.model || settings.model, elapsedMs: Date.now() - started })
    return { answer: sanitizeModelText(data.message?.content || ''), model: data.model || settings.model, elapsedMs: Date.now() - started }
  }

  const headers = { 'Content-Type': 'application/json', ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}) }
  const url = `${baseUrl}/chat/completions`
  const response = await fetchModel(url, {
    method: 'POST', headers, signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
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
  return { answer: sanitizeModelText(data.choices?.[0]?.message?.content || ''), model: data.model || settings.model, elapsedMs: Date.now() - started }
}

async function streamModel(settings, messages, onDelta, context = {}, signal) {
  validateSettings(settings)
  const baseUrl = cleanBaseUrl(settings.baseUrl)
  const started = Date.now()
  const isOllama = settings.provider === 'ollama'
  const endpoint = isOllama ? `${baseUrl}/api/chat` : `${baseUrl}/chat/completions`
  const headers = { 'Content-Type': 'application/json', ...(!isOllama && settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}) }
  const body = isOllama
    ? { model: settings.model, messages, stream: true, options: { temperature: Number(settings.temperature ?? 0.2) } }
    : { model: settings.model, messages, stream: true, temperature: Number(settings.temperature ?? 0.2), max_tokens: 1200 }
  let answer = ''

  try {
    const timeoutSignal = AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS)
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal })
    if (!response.ok) {
      const failure = await parseFailure(response)
      const error = new Error(String(failure.message || `HTTP ${response.status}`))
      error.status = response.status
      error.upstreamBody = failure.body
      throw error
    }
    if (!response.body) throw new Error('بدنه جریان پاسخ مدل در دسترس نیست.')

    const emitPayload = (raw) => {
      const line = raw.trim()
      if (!line || line === 'data: [DONE]' || line === '[DONE]') return
      const jsonText = line.startsWith('data:') ? line.slice(5).trim() : line
      let data
      try { data = JSON.parse(jsonText) } catch { return }
      const delta = isOllama ? data.message?.content : data.choices?.[0]?.delta?.content ?? data.choices?.[0]?.message?.content
      if (typeof delta === 'string' && delta) {
        const cleanDelta = sanitizeModelText(delta)
        if (cleanDelta) { answer += cleanDelta; onDelta(cleanDelta) }
      }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (const line of lines) emitPayload(line)
    }
    buffer += decoder.decode()
    if (buffer) emitPayload(buffer)
    if (!answer.trim()) throw new Error('مدل جریان پاسخ متنی معتبری برنگرداند.')

    const result = { answer: sanitizeModelText(answer), model: settings.model, elapsedMs: Date.now() - started }
    addLog('info', 'model_stream_succeeded', { ...context, operation: 'agent_stream', provider: settings.provider, model: settings.model, elapsedMs: result.elapsedMs })
    return result
  } catch (error) {
    addLog('error', 'model_request_failed', {
      ...context, operation: 'agent_stream', provider: settings.provider, model: settings.model,
      endpoint: redactUrl(endpoint), elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.name : 'UnknownError',
      upstreamStatus: error?.status, upstreamBody: error?.upstreamBody,
      cause: error?.cause instanceof Error ? error.cause.message : error?.cause,
    })
    throw error
  }
}

app.post('/api/llm/test', async (req, res) => {
  try { res.json({ ok: true, ...(await callModel(req.body, [], true, { requestId: req.requestId })) }) }
  catch (error) {
    addLog('error', 'connection_test_failed', { requestId: req.requestId, provider: req.body?.provider, model: req.body?.model, error: error instanceof Error ? error.message : String(error) })
    res.status(502).json({ ok: false, requestId: req.requestId, error: error instanceof Error ? error.message : 'خطای ناشناخته اتصال' })
  }
})

app.post('/api/llm/agent', async (req, res) => {
  const abortController = new AbortController()
  res.on('close', () => { if (!res.writableEnded) abortController.abort() })
  try {
    const { settings, agent, caseData, previousOutputs = [] } = req.body
    if (!agent?.title || !caseData?.summary) return res.status(400).json({ error: 'اطلاعات عامل یا پرونده ناقص است.' })
    const references = agent.id === 'rag'
      ? await searchKnowledge(`${caseData.title}\n${caseData.category}\n${caseData.narrative}\n${agent.instruction}`, 6)
      : []
    const messages = buildAgentMessages(agent, caseData, previousOutputs, references)
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders()
    const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`)
    const result = await streamModel(
      settings,
      messages,
      (delta) => send({ type: 'delta', delta }),
      { requestId: req.requestId, agent: agent.title, caseId: caseData.id },
      abortController.signal,
    )
    send({
      type: 'done', answer: result.answer, model: result.model, elapsedMs: result.elapsedMs,
      references: references.map(({ title, source, sourceUrl, page, citation, text }) => ({ title, source, sourceUrl, page, citation, text })),
    })
    res.end()
  } catch (error) {
    addLog('error', 'agent_request_failed', { requestId: req.requestId, agent: req.body?.agent?.title, caseId: req.body?.caseData?.id, model: req.body?.settings?.model, error: error instanceof Error ? error.message : String(error) })
    const message = error instanceof Error ? error.message : 'خطای ناشناخته مدل'
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', requestId: req.requestId, error: message })}\n\n`)
      res.end()
    } else res.status(502).json({ requestId: req.requestId, error: message })
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
