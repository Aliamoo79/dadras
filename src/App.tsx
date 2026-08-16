import { useEffect, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, ArrowLeft, BookOpenCheck, Bug, Check, CheckCircle2, ChevronDown, ChevronLeft, CircleDashed, Clock3, Eye, EyeOff, FileText, Gavel, Info, Menu, Pause, Play, RefreshCw, RotateCcw, Scale, Search, Settings2, Shield, ShieldCheck, Sparkles, Trash2, Upload, Users, Wifi, X } from 'lucide-react'
import { agents, sampleCases } from './data'
import type { AgentResponse, CaseData, KnowledgeDocument, LlmSettings, LogEntry, RagReference } from './types'

type Screen = 'home' | 'workspace' | 'logs' | 'knowledge'
type Tab = 'agents' | 'verdict' | 'citations'
type ConnectionState = 'untested' | 'testing' | 'connected' | 'failed'

const defaultSettings: LlmSettings = { provider: 'ollama', baseUrl: 'http://127.0.0.1:11434', model: 'gemma3:4b', apiKey: '', temperature: 0.2 }

const faNumber = (value: number) => new Intl.NumberFormat('fa-IR').format(value)

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [caseData, setCaseData] = useState<CaseData>(sampleCases[0])
  const [activeStep, setActiveStep] = useState(-1)
  const [paused, setPaused] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState(0)
  const [tab, setTab] = useState<Tab>('agents')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<LlmSettings>(() => {
    try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem('dadras-llm-settings') || '{}'), apiKey: '' } } catch { return defaultSettings }
  })
  const [connection, setConnection] = useState<ConnectionState>('untested')
  const [connectionMessage, setConnectionMessage] = useState('اتصال مدل هنوز بررسی نشده است.')
  const [agentResults, setAgentResults] = useState<Record<string, AgentResponse>>({})
  const [agentErrors, setAgentErrors] = useState<Record<string, string>>({})
  const [mobileMenu, setMobileMenu] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const finished = activeStep >= agents.length
  const running = activeStep >= 0 && !finished
  const progress = finished ? 100 : Math.max(0, Math.round(((activeStep + .35) / agents.length) * 100))

  useEffect(() => {
    if (!running || paused) return
    const agent = agents[activeStep]
    const activeAgents = agent.parallelGroup ? agents.filter((item) => item.parallelGroup === agent.parallelGroup) : [agent]
    let cancelled = false
    const controllers = activeAgents.map(() => new AbortController())
    setSelectedAgent(activeStep)
    setAgentErrors((current) => { const next = { ...current }; activeAgents.forEach((item) => delete next[item.id]); return next })
    const previousOutputs = agents.slice(0, activeStep).flatMap((item) => agentResults[item.id] ? [{ title: item.title, answer: agentResults[item.id].answer }] : [])
    setAgentResults((current) => Object.fromEntries([...Object.entries(current), ...activeAgents.map((item) => [item.id, { answer: '', model: settings.model, elapsedMs: 0 }])]))

    void (async () => {
      try {
        const runParallelAgents = async () => {
          const response = await fetch('/api/llm/agents', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controllers[0].signal,
            body: JSON.stringify({ settings, agents: activeAgents.map(({ id, title, instruction }) => ({ id, title, instruction })), caseData, previousOutputs }),
          })
          if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'پاسخی از مدل دریافت نشد.') }
          if (!response.body) throw new Error('جریان پاسخ مدل در مرورگر در دسترس نیست.')
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          const completed = new Set<string>()
          let buffer = ''
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const blocks = buffer.split(/\r?\n\r?\n/)
            buffer = blocks.pop() || ''
            for (const block of blocks) {
              const line = block.split(/\r?\n/).find((item) => item.startsWith('data:'))
              if (!line) continue
              const event = JSON.parse(line.slice(5).trim())
              if (!event.agentId) continue
              if (event.type === 'delta' && !cancelled) setAgentResults((current) => ({ ...current, [event.agentId]: { ...(current[event.agentId] || { model: settings.model, elapsedMs: 0 }), answer: `${current[event.agentId]?.answer || ''}${event.delta}` } }))
              else if (event.type === 'done' && !cancelled) { completed.add(event.agentId); setAgentResults((current) => ({ ...current, [event.agentId]: { answer: event.answer || current[event.agentId]?.answer || '', model: event.model || settings.model, elapsedMs: event.elapsedMs || 0, references: event.references || [] } })) }
              else if (event.type === 'agent_error' && !cancelled) setAgentErrors((current) => ({ ...current, [event.agentId]: event.error || 'خطای ناشناخته جریان' }))
            }
          }
          if (completed.size !== activeAgents.length) throw new Error('یک یا چند پاسخ هم زمان کامل نشد.')
        }

        const runAgent = async (currentAgent: typeof agent, signal: AbortSignal) => {
          try {
            const response = await fetch('/api/llm/agent', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
              body: JSON.stringify({ settings, agent: { id: currentAgent.id, title: currentAgent.title, instruction: currentAgent.instruction }, caseData, previousOutputs }),
            })
            if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'پاسخی از مدل دریافت نشد.') }
            if (!response.body) throw new Error('جریان پاسخ مدل در مرورگر در دسترس نیست.')
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            let completed = false
            while (true) {
              const { value, done } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              const blocks = buffer.split(/\r?\n\r?\n/)
              buffer = blocks.pop() || ''
              for (const block of blocks) {
                const line = block.split(/\r?\n/).find((item) => item.startsWith('data:'))
                if (!line) continue
                const event = JSON.parse(line.slice(5).trim())
                if (event.type === 'delta' && !cancelled) setAgentResults((current) => ({ ...current, [currentAgent.id]: { ...(current[currentAgent.id] || { model: settings.model, elapsedMs: 0 }), answer: `${current[currentAgent.id]?.answer || ''}${event.delta}` } }))
                else if (event.type === 'done' && !cancelled) { completed = true; setAgentResults((current) => ({ ...current, [currentAgent.id]: { ...(current[currentAgent.id] || { answer: '' }), answer: event.answer || current[currentAgent.id]?.answer || '', model: event.model || settings.model, elapsedMs: event.elapsedMs || 0, references: event.references || [] } })) }
                else if (event.type === 'error') throw new Error(event.error || 'جریان پاسخ مدل قطع شد.')
              }
            }
            if (!completed) throw new Error('جریان پاسخ پیش از تکمیل قطع شد.')
          } catch (error) {
            if (!cancelled) setAgentErrors((current) => ({ ...current, [currentAgent.id]: error instanceof Error ? error.message : 'خطای ناشناخته جریان' }))
            throw error
          }
        }
        const outcomes = activeAgents.length > 1
          ? await Promise.allSettled([runParallelAgents()])
          : await Promise.allSettled(activeAgents.map((currentAgent, index) => runAgent(currentAgent, controllers[index].signal)))
        if (cancelled) return
        if (outcomes.some((outcome) => outcome.status === 'rejected')) setPaused(true)
        else setActiveStep((value) => value + activeAgents.length)
      } catch {
        if (!cancelled) setPaused(true)
      }
    })()
    return () => { cancelled = true; controllers.forEach((controller) => controller.abort()) }
  }, [activeStep, paused, running])

  useEffect(() => {
    if (finished) setTab('verdict')
  }, [finished])

  const startCase = (selected = caseData) => {
    setCaseData(selected)
    setActiveStep(0)
    setPaused(false)
    setSelectedAgent(0)
    setTab('agents')
    setAgentResults({})
    setAgentErrors({})
    setScreen('workspace')
    setUploadOpen(false)
  }

  const reset = () => {
    setActiveStep(-1)
    setPaused(false)
    setSelectedAgent(0)
    setTab('agents')
    setAgentResults({})
    setAgentErrors({})
  }

  const statusFor = (index: number) => {
    if (agentErrors[agents[index].id]) return 'error'
    if (index < activeStep) return 'done'
    const activeAgent = agents[activeStep]
    if (!finished && (index === activeStep || (activeAgent?.parallelGroup && agents[index].parallelGroup === activeAgent.parallelGroup))) return 'running'
    return 'waiting'
  }

  const saveSettings = (next: LlmSettings) => {
    setSettings(next)
    const { apiKey: _secret, ...safe } = next
    localStorage.setItem('dadras-llm-settings', JSON.stringify(safe))
    setConnection('untested')
    setConnectionMessage('تنظیمات تغییر کرد؛ اتصال را دوباره آزمایش کنید.')
  }

  const testConnection = async (candidate: LlmSettings) => {
    setConnection('testing'); setConnectionMessage('در حال تماس با مدل…')
    try {
      const response = await fetch('/api/llm/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(candidate) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'آزمایش اتصال ناموفق بود.')
      setConnection('connected'); setConnectionMessage(`${body.answer} · ${body.elapsedMs}ms`); return true
    } catch (error) {
      setConnection('failed'); setConnectionMessage(error instanceof Error ? error.message : 'خطای اتصال'); return false
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setScreen('home')} aria-label="صفحه اصلی دادرس">
          <span className="brand-mark"><Scale size={23}/></span>
          <span><strong>دادرس</strong><small>دستیار تحلیل پرونده</small></span>
        </button>
        <nav className={mobileMenu ? 'nav open' : 'nav'} aria-label="ناوبری اصلی">
          <button className={screen === 'home' ? 'active' : ''} onClick={() => { setScreen('home'); setMobileMenu(false) }}>میز کار</button>
          <button onClick={() => { setScreen('workspace'); setMobileMenu(false) }}>پرونده‌ها</button>
          <button className={screen === 'logs' ? 'active' : ''} onClick={() => { setScreen('logs'); setMobileMenu(false) }}>گزارش خطاها</button>
          <button className={screen === 'knowledge' ? 'active' : ''} onClick={() => { setScreen('knowledge'); setMobileMenu(false) }}>پایگاه قوانین</button>
          <button onClick={() => setMobileMenu(false)}>راهنما</button>
        </nav>
        <div className="header-tools">
          <button className={`llm-chip ${connection}`} onClick={() => setSettingsOpen(true)}><span/><b>{settings.model}</b><Settings2 size={16}/></button>
          <button className="icon-btn" aria-label="جستجو"><Search size={19}/></button>
          <div className="user-chip"><span>ن ک</span><div><b>ناهید کریمی</b><small>قاضی شعبه ۱۲</small></div><ChevronDown size={15}/></div>
          <button className="menu-btn" onClick={() => setMobileMenu(!mobileMenu)} aria-label="باز کردن منو">{mobileMenu ? <X/> : <Menu/>}</button>
        </div>
      </header>

      <div className="notice"><Shield size={16}/><span><b>محیط نمایشی و آموزشی</b> — خروجی سامانه صرفاً پیشنهادی است و اعتبار قضایی ندارد. تصمیم نهایی باید توسط قاضی انسانی تأیید شود.</span></div>

      {screen === 'home' ? <Home onStart={startCase} onUpload={() => setUploadOpen(true)} /> : screen === 'logs' ? <LogsPage/> : screen === 'knowledge' ? <KnowledgePage/> : (
        <Workspace caseData={caseData} activeStep={activeStep} progress={progress} paused={paused} finished={finished} selectedAgent={selectedAgent} tab={tab} setTab={setTab} setSelectedAgent={setSelectedAgent} statusFor={statusFor} agentResults={agentResults} agentErrors={agentErrors} model={settings.model} onStart={() => startCase()} onPause={() => setPaused(!paused)} onReset={reset} onSettings={() => setSettingsOpen(true)}/>
      )}

      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onPick={() => fileRef.current?.click()} onStart={(uploaded: CaseData) => startCase(uploaded)} fileRef={fileRef}/>}
      {settingsOpen && <SettingsModal initial={settings} connection={connection} message={connectionMessage} onTest={testConnection} onSave={saveSettings} onClose={() => setSettingsOpen(false)}/>}
    </div>
  )
}

function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [level, setLevel] = useState<'all' | LogEntry['level']>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const loadLogs = async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch(`/api/logs?level=${level}&limit=500`)
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'دریافت گزارش‌ها ناموفق بود.')
      setLogs(body.logs || [])
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'خطای ناشناخته') }
    finally { setLoading(false) }
  }

  useEffect(() => { void loadLogs() }, [level])

  const clearLogs = async () => {
    if (!window.confirm('همه گزارش‌های فعلی پاک شوند؟')) return
    try {
      const response = await fetch('/api/logs', { method: 'DELETE' })
      if (!response.ok) throw new Error('پاک‌کردن گزارش‌ها ناموفق بود.')
      await loadLogs()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'خطای ناشناخته') }
  }

  const errors = logs.filter((entry) => entry.level === 'error').length
  const warnings = logs.filter((entry) => entry.level === 'warn').length
  return <main className="logs-page">
    <div className="logs-head"><div><span>عیب‌یابی درگاه مدل</span><h1>گزارش درخواست‌ها و خطاها</h1><p>آخرین ۵۰۰ رویداد این اجرای سرور؛ کلیدهای API در گزارش ذخیره نمی‌شوند.</p></div><div className="logs-actions"><button className="secondary" onClick={() => void loadLogs()} disabled={loading}><RefreshCw className={loading ? 'rotating' : ''}/>تازه‌سازی</button><button className="danger-button" onClick={() => void clearLogs()}><Trash2/>پاک‌کردن</button></div></div>
    <div className="log-stats"><div><Bug/><span><small>رویدادهای نمایشی</small><b>{faNumber(logs.length)}</b></span></div><div className="error"><AlertCircle/><span><small>خطا</small><b>{faNumber(errors)}</b></span></div><div className="warn"><AlertTriangle/><span><small>هشدار</small><b>{faNumber(warnings)}</b></span></div></div>
    <section className="logs-panel">
      <div className="logs-toolbar"><div className="log-filters">{(['all', 'error', 'warn', 'info'] as const).map((item) => <button key={item} className={level === item ? 'active' : ''} onClick={() => setLevel(item)}>{item === 'all' ? 'همه' : item === 'error' ? 'خطاها' : item === 'warn' ? 'هشدارها' : 'اطلاعات'}</button>)}</div><small>جدیدترین رویداد در بالا</small></div>
      {error && <div className="logs-fetch-error"><AlertCircle/>{error}</div>}
      {!loading && !error && logs.length === 0 && <div className="logs-empty"><CheckCircle2/><b>گزارشی برای نمایش نیست</b><p>پس از آزمایش اتصال یا اجرای عامل‌ها، رویدادها اینجا ظاهر می‌شوند.</p></div>}
      <div className="log-list">{logs.map((entry) => <article key={entry.id} className={`log-row ${entry.level}`}>
        <button className="log-summary" onClick={() => setSelected(selected === entry.id ? null : entry.id)}>
          <span className="log-level">{entry.level === 'error' ? <AlertCircle/> : entry.level === 'warn' ? <AlertTriangle/> : <Info/>}</span>
          <span className="log-main"><b>{entry.error || entry.event}</b><small>{entry.event} {entry.agent ? `· ${entry.agent}` : ''} {entry.model ? `· ${entry.model}` : ''}</small></span>
          <span className="log-code">{entry.upstreamStatus || entry.status || '—'}</span>
          <time dir="ltr">{new Date(entry.timestamp).toLocaleString('fa-IR')}</time><ChevronDown className={selected === entry.id ? 'open' : ''}/>
        </button>
        {selected === entry.id && <div className="log-details"><dl>
          <div><dt>شناسه درخواست</dt><dd>{entry.requestId || '—'}</dd></div><div><dt>زمان پاسخ</dt><dd>{entry.elapsedMs != null ? `${entry.elapsedMs} ms` : '—'}</dd></div><div><dt>مسیر</dt><dd>{entry.endpoint || entry.path || '—'}</dd></div><div><dt>پرونده</dt><dd>{entry.caseId || '—'}</dd></div>
        </dl><pre dir="ltr">{JSON.stringify(entry, null, 2)}</pre></div>}
      </article>)}</div>
    </section>
  </main>
}

function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const loadDocuments = async () => {
    const response = await fetch('/api/knowledge')
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'دریافت منابع ناموفق بود.')
    setDocuments(body.documents || [])
  }

  useEffect(() => { void loadDocuments().catch((error) => setMessage(error.message)) }, [])

  const saveDocument = async () => {
    if (!title.trim() || !content.trim()) { setMessage('نام منبع و متن مرجع را وارد کنید.'); return }
    setSaving(true); setMessage('')
    try {
      const response = await fetch('/api/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'ذخیره منبع ناموفق بود.')
      setTitle(''); setContent(''); setMessage('منبع ذخیره شد و از اجرای بعدی در RAG جست‌وجو می‌شود.')
      await loadDocuments()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'خطای ناشناخته') }
    finally { setSaving(false) }
  }

  const pickFile = async (file?: File) => {
    if (!file) return
    setTitle(file.name.replace(/\.(md|txt)$/i, ''))
    setContent(await file.text())
    setMessage('')
  }

  return <main className="knowledge-page">
    <div className="knowledge-head"><div><span>منابع ماندگار RAG</span><h1>پایگاه قوانین و مراجع</h1><p>متن قانون، کتاب یا یادداشت حقوقی را اضافه کنید. عامل بازیابی دانش بخش‌های مرتبط را خودکار در پاسخ به کار می‌گیرد.</p></div><BookOpenCheck/></div>
    <div className="knowledge-grid">
      <section className="knowledge-editor"><h2>افزودن منبع</h2><label>نام منبع<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثلاً: شرح قانون مدنی"/></label><label>متن مرجع<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="متن مرجع را اینجا بچسبانید…"/></label><div className="knowledge-actions"><label className="secondary file-picker"><Upload/>خواندن TXT یا MD<input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => void pickFile(event.target.files?.[0])}/></label><button className="primary" disabled={saving} onClick={() => void saveDocument()}>{saving ? 'در حال ذخیره…' : 'ذخیره در پایگاه'}</button></div>{message && <p className="knowledge-message">{message}</p>}</section>
      <section className="knowledge-library"><div><small>منابع فعال</small><h2>{faNumber(documents.length)} منبع قابل جست‌وجو</h2></div><div className="knowledge-list">{documents.map((document) => <article key={document.id}><FileText/><div><b>{document.title}</b><small>{faNumber(Math.ceil(document.size / 1024))} کیلوبایت · {new Date(document.updatedAt).toLocaleDateString('fa-IR')}</small></div><CheckCircle2/></article>)}</div></section>
    </div>
  </main>
}

function Home({ onStart, onUpload }: { onStart: (c: CaseData) => void; onUpload: () => void }) {
  return <main className="home">
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><Sparkles size={15}/> میز تحلیل هوشمند پرونده</div>
        <h1>از انبوه اوراق،<br/><em>تا یک مسیر روشن.</em></h1>
        <p>دادرس پرونده را می‌خواند، مواد مرتبط را بازیابی می‌کند و استدلال هر عامل را برای بازبینی شما کنار هم می‌گذارد.</p>
        <div className="hero-actions"><button className="primary" onClick={onUpload}><Upload size={18}/> افزودن پرونده</button><button className="secondary" onClick={() => onStart(sampleCases[0])}><Play size={17}/> اجرای پرونده نمونه</button></div>
      </div>
      <div className="dossier" aria-label="نمایش مسیر تحلیل پرونده">
        <div className="dossier-tab">پرونده در جریان</div>
        <div className="dossier-header"><span>شناسه</span><b>۰۳-۱۴۰۳-۹۸۲۱</b><small>مطالبه وجه قرارداد پیمانکاری</small></div>
        <div className="thread">
          {['دریافت و خوانش', 'پردازش و بازیابی', 'استدلال عامل‌ها', 'تلفیق تصمیم', 'صحت‌سنجی'].map((item, i) => <div className="thread-row" key={item}><span className={`thread-knot ${i < 3 ? 'lit' : ''}`}>{i < 2 ? <Check size={13}/> : faNumber(i + 1)}</span><div><b>{item}</b><small>{i < 2 ? 'تکمیل شده' : i === 2 ? 'در حال بررسی' : 'در انتظار'}</small></div></div>)}
        </div>
        <div className="seal"><Scale/><span>تصمیم با انسان می‌ماند</span></div>
      </div>
    </section>

    <section className="case-section">
      <div className="section-heading"><div><span>پرونده‌های آماده نمایش</span><h2>یک مسیر را برای بررسی انتخاب کنید</h2></div><button>مشاهده همه <ArrowLeft size={16}/></button></div>
      <div className="case-grid">
        {sampleCases.map((item, index) => <article className="case-card" key={item.id}>
          <div className="case-top"><span className="case-number">{item.id}</span><span className={`priority ${index ? 'urgent' : ''}`}>{item.urgency}</span></div>
          <h3>{item.title}</h3><p>{item.summary}</p>
          <dl><div><dt>نوع پرونده</dt><dd>{item.category}</dd></div><div><dt>مبلغ خواسته</dt><dd>{item.amount}</dd></div><div><dt>تاریخ ثبت</dt><dd>{item.filedAt}</dd></div></dl>
          <button onClick={() => onStart(item)}>باز کردن و اجرای تحلیل <ChevronLeft size={17}/></button>
        </article>)}
        <button className="new-case" onClick={onUpload}><span><Upload/></span><b>پرونده دیگری دارید؟</b><small>فایل PDF یا صوت جلسه را اضافه کنید</small></button>
      </div>
    </section>
  </main>
}

function Workspace({ caseData, activeStep, progress, paused, finished, selectedAgent, tab, setTab, setSelectedAgent, statusFor, agentResults, agentErrors, model, onStart, onPause, onReset, onSettings }: any) {
  const selected = agents[selectedAgent]
  const selectedResult: AgentResponse | undefined = agentResults[selected.id]
  const selectedError: string | undefined = agentErrors[selected.id]
  const ragReferences: RagReference[] = Object.values(agentResults as Record<string, AgentResponse>).flatMap((result) => result.references || [])
  return <main className="workspace">
    <div className="workspace-head">
      <div><span className="crumb">پرونده‌ها / {caseData.id}</span><h1>{caseData.title}</h1><p>{caseData.branch} · ثبت {caseData.filedAt}</p></div>
      <div className="workspace-actions"><button className="model-button" onClick={onSettings}><Wifi/><span><small>مدل فعال</small><b>{model}</b></span></button>{activeStep < 0 ? <button className="primary" onClick={onStart}><Play size={17}/> آغاز تحلیل واقعی</button> : <><button className="secondary compact" onClick={onPause} disabled={finished}>{paused ? <Play/> : <Pause/>}{paused ? (selectedError ? 'تلاش دوباره' : 'ادامه') : 'توقف'}</button><button className="icon-btn bordered" onClick={onReset} title="شروع دوباره"><RotateCcw size={18}/></button></>}</div>
    </div>

    <div className="progress-panel">
      <div className="progress-meta"><span>{finished ? <><CheckCircle2/> تحلیل کامل شد</> : activeStep < 0 ? <><CircleDashed/> آماده پردازش</> : <><span className="pulse-dot"/> {paused ? 'پردازش متوقف است' : agents[activeStep]?.parallelGroup === 'advocates' ? 'در حال اجرای هم‌زمان وکیل خواهان و وکیل خوانده' : `در حال اجرای ${agents[activeStep]?.title}`}</>}</span><b>{faNumber(progress)}٪</b></div>
      <div className="progress-track"><span style={{ width: `${progress}%` }}/></div>
      <div className="layer-labels">{['ادراک', 'پردازش', 'استدلال', 'تصمیم نهایی', 'صحت‌سنجی'].map((x) => <span key={x}>{x}</span>)}</div>
    </div>

    <div className="workspace-grid">
      <aside className="case-sidebar">
        <h2><FileText/> شناسنامه پرونده</h2>
        <div className="case-id"><small>شناسه یکتا</small><b>{caseData.id}</b></div>
        <dl><div><dt>طرفین</dt><dd>{caseData.parties}</dd></div><div><dt>نوع</dt><dd>{caseData.category}</dd></div><div><dt>مبلغ</dt><dd>{caseData.amount}</dd></div><div><dt>فوریت</dt><dd>{caseData.urgency}</dd></div></dl>
        <h3>خلاصه ورودی</h3><p>{caseData.summary}</p>
        <button className="text-btn">مشاهده سند ورودی <ChevronLeft size={15}/></button>
      </aside>

      <section className="main-panel">
        <div className="tabs" role="tablist"><button className={tab === 'agents' ? 'active' : ''} onClick={() => setTab('agents')}>گردش عامل‌ها</button><button className={tab === 'verdict' ? 'active' : ''} onClick={() => setTab('verdict')}>رأی پیشنهادی {finished && <span>آماده</span>}</button><button className={tab === 'citations' ? 'active' : ''} onClick={() => setTab('citations')}>استنادات قانونی</button></div>
        {tab === 'agents' && <div className="agents-layout">
          <div className="agent-list">{agents.map((agent, index) => {
            if (agent.parallelGroup && agents.findIndex((item) => item.parallelGroup === agent.parallelGroup) !== index) return null
            const groupIndexes = agent.parallelGroup ? agents.map((item, itemIndex) => item.parallelGroup === agent.parallelGroup ? itemIndex : -1).filter((itemIndex) => itemIndex >= 0) : [index]
            const groupStates = groupIndexes.map(statusFor)
            const state = groupStates.includes('error') ? 'error' : groupStates.includes('running') ? 'running' : groupStates.every((item) => item === 'done') ? 'done' : 'waiting'
            const isAdvocates = agent.parallelGroup === 'advocates'
            const Icon = isAdvocates ? Users : agent.icon
            const selectedGroup = selected.parallelGroup && selected.parallelGroup === agent.parallelGroup
            return <button key={agent.parallelGroup || agent.id} className={`agent-row ${state} ${selectedAgent === index || selectedGroup ? 'selected' : ''}`} onClick={() => setSelectedAgent(index)}><span className="agent-icon"><Icon/></span><span className="agent-copy"><b>{isAdvocates ? 'وکلای طرفین' : agent.title}</b><small>{isAdvocates ? 'استدلال · دو دفاع مستقل و هم زمان' : `${agent.layer} · ${agent.subtitle}`}</small></span><span className="agent-status">{state === 'done' ? <Check/> : state === 'running' ? <span className="spinner"/> : state === 'error' ? <AlertCircle/> : <Clock3/>}</span></button>
          })}</div>
          <div className="agent-detail">
            {selected.parallelGroup === 'advocates' ? <AdvocateComparison agentResults={agentResults} agentErrors={agentErrors} statusFor={statusFor} model={model}/> : <>
            <div className="detail-title"><span className="large-icon">{(() => { const I = selected.icon; return <I/> })()}</span><div><small>گزارش عامل · {selected.layer}</small><h2>{selected.title}</h2></div></div>
            {selectedError ? <div className="agent-error"><AlertCircle/><div><b>ارتباط این مرحله با مدل ناموفق بود</b><p>{selectedError}</p><small>تنظیمات مدل را بررسی کنید، سپس «تلاش دوباره» را بزنید.</small></div></div> : statusFor(selectedAgent) === 'waiting' ? <div className="empty-state"><CircleDashed/><b>این عامل هنوز اجرا نشده است</b><p>پس از تکمیل مراحل پیشین، درخواست واقعی این بخش برای مدل ارسال می‌شود.</p></div> : statusFor(selectedAgent) === 'running' && !selectedResult?.answer ? <div className="llm-thinking"><span className="thinking-orbit"><Sparkles/></span><b>{model} در حال تحلیل است</b><p>با دریافت نخستین بخش پاسخ، متن به‌صورت زنده نمایش داده می‌شود.</p></div> : <><div className="response-meta"><span><Sparkles/> {statusFor(selectedAgent) === 'running' ? 'پاسخ زنده مدل' : 'پاسخ مستقیم مدل'}</span><span>{selectedResult?.model} {statusFor(selectedAgent) === 'running' ? '· در حال دریافت…' : selectedResult ? `· ${(selectedResult.elapsedMs / 1000).toFixed(1)}s` : ''}</span></div><div className={`reason-box llm-answer ${statusFor(selectedAgent) === 'running' ? 'streaming' : ''}`}><FormattedAnswer text={selectedResult?.answer || selected.result}/></div>{statusFor(selectedAgent) !== 'running' && <div className="explain"><Info/><p><b>شفافیت تصمیم:</b> این متن مستقیماً توسط مدل پیکربندی‌شده تولید شده است. خروجی ممکن است نادرست یا دارای استناد ساختگی باشد و باید توسط قاضی بررسی شود.</p></div>}</>}
            </>}
          </div>
        </div>}
        {tab === 'verdict' && <Verdict ready={finished} modelAnswer={agentResults.synthesis?.answer}/>}
        {tab === 'citations' && <Citations references={ragReferences}/>}
      </section>
    </div>
  </main>
}

function AdvocateComparison({ agentResults, agentErrors, statusFor, model }: { agentResults: Record<string, AgentResponse>; agentErrors: Record<string, string>; statusFor: (index: number) => string; model: string }) {
  const advocates = agents.filter((agent) => agent.parallelGroup === 'advocates')
  return <div className="advocate-comparison">
    <div className="detail-title debate-title"><span className="large-icon"><Scale/></span><div><small>اجرای هم‌زمان · دو دیدگاه مستقل</small><h2>استدلال طرفین</h2></div><span className="parallel-badge"><span className="pulse-dot"/>موازی</span></div>
    <div className="advocate-grid">{advocates.map((advocate) => {
      const index = agents.findIndex((item) => item.id === advocate.id)
      const state = statusFor(index)
      const result = agentResults[advocate.id]
      const error = agentErrors[advocate.id]
      const Icon = advocate.icon
      return <article className={`advocate-card ${advocate.perspective}`} key={advocate.id}>
        <header><span><Icon/></span><div><small>{advocate.perspective === 'claimant' ? 'به نفع خواهان' : 'به نفع خوانده'}</small><h3>{advocate.title}</h3></div><span className={`advocate-state ${state}`}>{state === 'running' ? <span className="spinner"/> : state === 'done' ? <Check/> : state === 'error' ? <AlertCircle/> : <Clock3/>}</span></header>
        {error ? <div className="advocate-error"><AlertCircle/><p>{error}</p></div> : state === 'waiting' ? <div className="advocate-waiting"><CircleDashed/><p>این دفاع پس از مراحل پیشین هم‌زمان با دیدگاه طرف مقابل اجرا می‌شود.</p></div> : state === 'running' && !result?.answer ? <div className="advocate-waiting"><span className="thinking-orbit"><Sparkles/></span><p>{model} در حال تهیه دفاع است…</p></div> : <><div className="advocate-meta"><span>{state === 'running' ? 'پاسخ زنده' : 'دفاع تکمیل‌شده'}</span><small>{result?.model}{result?.elapsedMs ? ` · ${(result.elapsedMs / 1000).toFixed(1)}s` : ''}</small></div><div className={`advocate-answer ${state === 'running' ? 'streaming' : ''}`}><FormattedAnswer text={result?.answer || advocate.result}/></div></>}
      </article>
    })}</div>
    <div className="explain"><Info/><p><b>جدایی استدلال‌ها:</b> هر وکیل با یک درخواست مستقل و هم‌زمان پاسخ می‌دهد؛ هیچ‌یک استدلال طرف دیگر را تولید نمی‌کند.</p></div>
    <div className="future-note"><Sparkles/><p><b>قابلیت نسخه‌های پیشرفته‌تر:</b> هر وکیل می‌تواند پاسخ وکیل طرف مقابل را بخواند و در یک دور دوم، پاسخ متقابل و استدلال تکمیلی ارائه کند.</p></div>
  </div>
}

function InlineBold({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part)}</>
}

function FormattedAnswer({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  return <div className="answer-document">{lines.map((raw, index) => {
    const line = raw.trim()
    if (!line) return <span className="answer-space" key={index}/>
    const heading = line.match(/^(?:#{1,4}\s*|\*\*)(.*?)(?:\*\*)?$/)
    if (heading || /^(نتیجه|استدلال|جمع‌بندی|نیازمند بررسی|منابع|پیشنهاد|تحلیل)(?:\s|:|$)/.test(line)) return <h3 key={index}><InlineBold text={(heading?.[1] || line).replace(/:$/, '')}/></h3>
    const list = line.match(/^([۰-۹0-9]+[.)-]|[-•])\s*(.*)$/)
    if (list) return <div className="answer-list-item" key={index}><span>{list[1]}</span><p><InlineBold text={list[2]}/></p></div>
    return <p key={index}><InlineBold text={line}/></p>
  })}</div>
}

function Verdict({ ready, modelAnswer }: { ready: boolean; modelAnswer?: string }) {
  if (!ready) return <div className="locked"><Gavel/><h2>پیش‌نویس هنوز آماده نیست</h2><p>برای مشاهده رأی پیشنهادی، اجازه دهید همه عامل‌ها و مرحله صحت‌سنجی تکمیل شوند.</p></div>
  return <div className="verdict">
    <div className="verdict-banner"><ShieldCheck/><div><b>پیش‌نویس با موفقیت صحت‌سنجی شد</b><span>۴ استناد بررسی شد · ۱ مورد نیازمند توجه قاضی</span></div></div>
    <div className="document"><div className="document-kicker">به نام خدا · جمع‌بندی تولیدشده توسط مدل</div><h2>دادنامه پیشنهادی</h2><div className="generated-verdict"><FormattedAnswer text={modelAnswer || 'جمع‌بندی مدل در دسترس نیست.'}/></div><div className="judge-note"><AlertTriangle/><p><b>نقطه تصمیم انسانی:</b> تمام محاسبات، اصالت اسناد و استنادهای حقوقی باید پیش از هر استفاده توسط قاضی بررسی شوند.</p></div></div>
    <div className="verdict-actions"><button className="secondary">دریافت گزارش کامل</button><button className="primary">ارسال برای بازبینی انسانی <ArrowLeft/></button></div>
  </div>
}

function Citations({ references }: { references: RagReference[] }) {
  const unique = [...new Map(references.map((reference) => [`${reference.source}:${reference.page || ''}:${reference.citation || ''}:${reference.text}`, reference])).values()]
  return <div className="citations"><div className="citation-summary"><BookOpenCheck/><div><b>منابع واقعی بازیابی‌شده</b><span>این فهرست مستقیماً از متن‌هایی می‌آید که RAG برای همین پرونده بازیابی کرده است.</span></div><strong>{faNumber(unique.length)}</strong></div>{unique.length === 0 ? <div className="citation-empty"><CircleDashed/><b>هنوز منبعی بازیابی نشده است</b><p>پس از اجرای عامل بازیابی دانش، منابع و صفحه‌های واقعی در اینجا نمایش داده می‌شوند.</p></div> : unique.map((reference, index) => <article key={`${reference.source}-${reference.page}-${index}`}><div className="citation-body"><h3>{reference.title}</h3><div className="citation-location">{reference.citation && <span>{reference.citation}</span>}{reference.page && <span>صفحه {faNumber(reference.page)}</span>}<span dir="ltr">{reference.source}</span></div><p>{reference.text}</p>{reference.sourceUrl && <a href={reference.sourceUrl} target="_blank" rel="noreferrer">مشاهده منبع <ArrowLeft/></a>}</div><div className="citation-tags"><span><CheckCircle2/>بازیابی مستقیم</span><span>رتبه {faNumber(index + 1)}</span></div></article>)}</div>
}

function SettingsModal({ initial, connection, message, onTest, onSave, onClose }: { initial: LlmSettings; connection: ConnectionState; message: string; onTest: (value: LlmSettings) => Promise<boolean>; onSave: (value: LlmSettings) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<LlmSettings>(initial)
  const [showKey, setShowKey] = useState(false)
  const update = <K extends keyof LlmSettings>(key: K, value: LlmSettings[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const defaults = draft.provider === 'ollama' ? { url: 'http://127.0.0.1:11434', model: 'gemma3:4b' } : { url: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' }
  const switchProvider = (provider: LlmSettings['provider']) => setDraft((current) => ({ ...current, provider, baseUrl: provider === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.openai.com/v1', model: provider === 'ollama' ? 'gemma3:4b' : 'gpt-4.1-mini' }))
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <button className="modal-close" onClick={onClose}><X/></button>
    <div className="settings-heading"><span className="modal-icon"><Settings2/></span><div><small>درگاه استدلال سامانه</small><h2 id="settings-title">تنظیمات مدل زبانی</h2></div></div>
    <p className="settings-intro">هر عامل یک درخواست مستقل به این مدل می‌فرستد. کلید API فقط در حافظه این صفحه می‌ماند و ذخیره نمی‌شود.</p>
    <div className="future-note compact-note"><Search/><p><b>ابزارهای مدل در نسخه‌های پیشرفته‌تر:</b> مدل می‌تواند با Tool Calling از ابزارهایی مانند جست‌وجوی وب، بررسی پایگاه‌های رسمی و سرویس‌های تخصصی استفاده کند.</p></div>
    <div className="provider-switch"><button className={draft.provider === 'ollama' ? 'active' : ''} onClick={() => switchProvider('ollama')}><span className="provider-mark local">L</span><span><b>مدل محلی</b><small>Ollama روی رایانه شما</small></span></button><button className={draft.provider === 'openai-compatible' ? 'active' : ''} onClick={() => switchProvider('openai-compatible')}><span className="provider-mark api">A</span><span><b>API سازگار</b><small>OpenAI یا سرویس مشابه</small></span></button></div>
    <div className="settings-fields">
      <label><span>نشانی سرویس</span><input dir="ltr" value={draft.baseUrl} placeholder={defaults.url} onChange={(e) => update('baseUrl', e.target.value)}/><small>{draft.provider === 'ollama' ? 'نشانی پیش‌فرض Ollama؛ بدون / در انتها' : 'نشانی باید به مسیر نسخه API مانند /v1 ختم شود'}</small></label>
      <label><span>نام مدل</span><input dir="ltr" value={draft.model} placeholder={defaults.model} onChange={(e) => update('model', e.target.value)}/><small>نام باید دقیقاً با مدل نصب‌شده یا شناسه API برابر باشد.</small></label>
      {draft.provider === 'openai-compatible' && <label><span>کلید API</span><div className="secret-input"><input dir="ltr" type={showKey ? 'text' : 'password'} value={draft.apiKey} onChange={(e) => update('apiKey', e.target.value)} placeholder="sk-…"/><button onClick={() => setShowKey(!showKey)} aria-label="نمایش کلید">{showKey ? <EyeOff/> : <Eye/>}</button></div><small>این مقدار در localStorage نوشته نمی‌شود.</small></label>}
      <label><span>دمای پاسخ <b>{draft.temperature.toFixed(1)}</b></span><input type="range" min="0" max="1" step="0.1" value={draft.temperature} onChange={(e) => update('temperature', Number(e.target.value))}/><small>برای تحلیل حقوقی، مقدار پایین‌تر پاسخ‌های پایدارتر می‌دهد.</small></label>
    </div>
    <div className={`connection-result ${connection}`}><span>{connection === 'testing' ? <span className="spinner"/> : connection === 'connected' ? <CheckCircle2/> : connection === 'failed' ? <AlertCircle/> : <Wifi/>}</span><p>{message}</p></div>
    <div className="settings-actions"><button className="secondary" disabled={connection === 'testing'} onClick={() => onTest(draft)}>{connection === 'testing' ? 'در حال آزمایش…' : 'آزمایش اتصال'}</button><button className="primary" onClick={() => { onSave(draft); onClose() }}>ذخیره تنظیمات <Check/></button></div>
  </div></div>
}

function UploadModal({ onClose, onPick, onStart, fileRef }: any) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const upload = async () => {
    if (!file) { setError('ابتدا یک فایل PDF انتخاب کنید.'); return }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setError('در حال حاضر فقط PDF متنی پشتیبانی می‌شود.'); return }
    if (file.size > 25 * 1024 * 1024) { setError('حجم PDF باید کمتر از ۲۵ مگابایت باشد.'); return }
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/cases/extract', { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(file.name) }, body: file })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'استخراج متن PDF ناموفق بود.')
      onStart(body.caseData)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'خطای ناشناخته') }
    finally { setLoading(false) }
  }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="upload-title"><button className="modal-close" onClick={onClose}><X/></button><span className="modal-icon"><Upload/></span><h2 id="upload-title">افزودن پرونده برای تحلیل</h2><p>متن PDF واقعی استخراج و به‌عنوان ورودی همه عامل‌ها استفاده می‌شود. PDF اسکن‌شده به OCR نیاز دارد.</p><div className="future-note compact-note upload-future"><Sparkles/><p><b>قابلیت نسخه‌های پیشرفته‌تر:</b> فرمت‌های بیشتر مانند تصویر، PDF اسکن‌شده، فایل صوتی و صدای جلسه با OCR و ASR قابل پردازش خواهند بود.</p></div><button className="dropzone" onClick={onPick} disabled={loading}><FileText/><b>{file ? file.name : 'فایل PDF را انتخاب کنید'}</b><small>PDF متنی · حداکثر ۲۵ مگابایت</small></button><input ref={fileRef} hidden type="file" accept="application/pdf,.pdf" onChange={(e) => { setFile(e.target.files?.[0] || null); setError('') }}/><div className="privacy"><Shield/><span>فایل به پایگاه دانش اضافه نمی‌شود؛ فقط متن آن در تحلیل جاری استفاده می‌شود.</span></div>{error && <div className="upload-error"><AlertCircle/>{error}</div>}<button className="primary full" disabled={!file || loading} onClick={() => void upload()}>{loading ? 'در حال خواندن PDF…' : 'افزودن و آغاز تحلیل'}<ArrowLeft/></button></div></div>
}

export default App
