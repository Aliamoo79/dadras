import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, BookOpenCheck, Check, CheckCircle2, ChevronDown, ChevronLeft, CircleDashed, Clock3, FileText, Gavel, Info, Menu, Pause, Play, RotateCcw, Scale, Search, Shield, ShieldCheck, Sparkles, Upload, X } from 'lucide-react'
import { agents, legalCitations, sampleCases } from './data'
import type { CaseData } from './types'

type Screen = 'home' | 'workspace'
type Tab = 'agents' | 'verdict' | 'citations'

const faNumber = (value: number) => new Intl.NumberFormat('fa-IR').format(value)

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [caseData, setCaseData] = useState<CaseData>(sampleCases[0])
  const [activeStep, setActiveStep] = useState(-1)
  const [paused, setPaused] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState(0)
  const [tab, setTab] = useState<Tab>('agents')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const finished = activeStep >= agents.length
  const running = activeStep >= 0 && !finished
  const progress = finished ? 100 : Math.max(0, Math.round(((activeStep + .35) / agents.length) * 100))

  useEffect(() => {
    if (!running || paused) return
    const timeout = window.setTimeout(() => {
      setSelectedAgent(activeStep)
      setActiveStep((value) => value + 1)
    }, agents[activeStep].duration)
    return () => window.clearTimeout(timeout)
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
    setScreen('workspace')
    setUploadOpen(false)
  }

  const reset = () => {
    setActiveStep(-1)
    setPaused(false)
    setSelectedAgent(0)
    setTab('agents')
  }

  const statusFor = (index: number) => index < activeStep ? 'done' : index === activeStep && !finished ? 'running' : 'waiting'

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
          <button onClick={() => setMobileMenu(false)}>پایگاه قوانین</button>
          <button onClick={() => setMobileMenu(false)}>راهنما</button>
        </nav>
        <div className="header-tools">
          <button className="icon-btn" aria-label="جستجو"><Search size={19}/></button>
          <div className="user-chip"><span>ن ک</span><div><b>ناهید کریمی</b><small>قاضی شعبه ۱۲</small></div><ChevronDown size={15}/></div>
          <button className="menu-btn" onClick={() => setMobileMenu(!mobileMenu)} aria-label="باز کردن منو">{mobileMenu ? <X/> : <Menu/>}</button>
        </div>
      </header>

      <div className="notice"><Shield size={16}/><span><b>محیط نمایشی و آموزشی</b> — خروجی سامانه صرفاً پیشنهادی است و اعتبار قضایی ندارد. تصمیم نهایی باید توسط قاضی انسانی تأیید شود.</span></div>

      {screen === 'home' ? <Home onStart={startCase} onUpload={() => setUploadOpen(true)} /> : (
        <Workspace caseData={caseData} activeStep={activeStep} progress={progress} paused={paused} finished={finished} selectedAgent={selectedAgent} tab={tab} setTab={setTab} setSelectedAgent={setSelectedAgent} statusFor={statusFor} onStart={() => startCase()} onPause={() => setPaused(!paused)} onReset={reset}/>
      )}

      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onPick={() => fileRef.current?.click()} onStart={() => startCase()} fileRef={fileRef}/>} 
    </div>
  )
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

function Workspace({ caseData, activeStep, progress, paused, finished, selectedAgent, tab, setTab, setSelectedAgent, statusFor, onStart, onPause, onReset }: any) {
  const selected = agents[selectedAgent]
  return <main className="workspace">
    <div className="workspace-head">
      <div><span className="crumb">پرونده‌ها / {caseData.id}</span><h1>{caseData.title}</h1><p>{caseData.branch} · ثبت {caseData.filedAt}</p></div>
      <div className="workspace-actions">{activeStep < 0 ? <button className="primary" onClick={onStart}><Play size={17}/> آغاز تحلیل</button> : <><button className="secondary compact" onClick={onPause} disabled={finished}>{paused ? <Play/> : <Pause/>}{paused ? 'ادامه' : 'توقف'}</button><button className="icon-btn bordered" onClick={onReset} title="شروع دوباره"><RotateCcw size={18}/></button></>}</div>
    </div>

    <div className="progress-panel">
      <div className="progress-meta"><span>{finished ? <><CheckCircle2/> تحلیل کامل شد</> : activeStep < 0 ? <><CircleDashed/> آماده پردازش</> : <><span className="pulse-dot"/> {paused ? 'پردازش متوقف است' : `در حال اجرای ${agents[activeStep]?.title}`}</>}</span><b>{faNumber(progress)}٪</b></div>
      <div className="progress-track"><span style={{ width: `${progress}%` }}/></div>
      <div className="layer-labels">{['ادراک', 'پردازش', 'استدلال', 'تصمیم نهایی', 'صحت‌سنجی'].map((x) => <span key={x}>{x}</span>)}</div>
    </div>

    <div className="workspace-grid">
      <aside className="case-sidebar">
        <h2><FileText/> شناسنامه پرونده</h2>
        <div className="case-id"><small>شناسه یکتا</small><b>{caseData.id}</b></div>
        <dl><div><dt>طرفین</dt><dd>{caseData.parties}</dd></div><div><dt>نوع</dt><dd>{caseData.category}</dd></div><div><dt>مبلغ</dt><dd>{caseData.amount}</dd></div><div><dt>فوریت</dt><dd>{caseData.urgency}</dd></div></dl>
        <h3>خلاصه ورودی</h3><p>{caseData.narrative}</p>
        <button className="text-btn">مشاهده سند ورودی <ChevronLeft size={15}/></button>
      </aside>

      <section className="main-panel">
        <div className="tabs" role="tablist"><button className={tab === 'agents' ? 'active' : ''} onClick={() => setTab('agents')}>گردش عامل‌ها</button><button className={tab === 'verdict' ? 'active' : ''} onClick={() => setTab('verdict')}>رأی پیشنهادی {finished && <span>آماده</span>}</button><button className={tab === 'citations' ? 'active' : ''} onClick={() => setTab('citations')}>استنادات قانونی</button></div>
        {tab === 'agents' && <div className="agents-layout">
          <div className="agent-list">{agents.map((agent, index) => { const state = statusFor(index); const Icon = agent.icon; return <button key={agent.id} className={`agent-row ${state} ${selectedAgent === index ? 'selected' : ''}`} onClick={() => setSelectedAgent(index)}><span className="agent-icon"><Icon/></span><span className="agent-copy"><b>{agent.title}</b><small>{agent.layer} · {agent.subtitle}</small></span><span className="agent-status">{state === 'done' ? <Check/> : state === 'running' ? <span className="spinner"/> : <Clock3/>}</span></button> })}</div>
          <div className="agent-detail">
            <div className="detail-title"><span className="large-icon">{(() => { const I = selected.icon; return <I/> })()}</span><div><small>گزارش عامل · {selected.layer}</small><h2>{selected.title}</h2></div></div>
            {statusFor(selectedAgent) === 'waiting' ? <div className="empty-state"><CircleDashed/><b>این عامل هنوز اجرا نشده است</b><p>پس از تکمیل مراحل پیشین، گزارش مستدل این بخش نمایش داده می‌شود.</p></div> : <><div className="reason-box"><span>نتیجه و دلیل</span><p>{selected.result}</p></div><div className="evidence"><span>شواهد و خروجی‌ها</span>{selected.evidence.map((e: string) => <div key={e}><CheckCircle2/>{e}</div>)}</div><div className="explain"><Info/><p><b>شفافیت تصمیم:</b> این نتیجه از داده‌های ساختگی پرونده و پایگاه دانش نمونه تولید شده و برای تصمیم قضایی واقعی کافی نیست.</p></div></>}
          </div>
        </div>}
        {tab === 'verdict' && <Verdict ready={finished}/>} 
        {tab === 'citations' && <Citations/>}
      </section>
    </div>
  </main>
}

function Verdict({ ready }: { ready: boolean }) {
  if (!ready) return <div className="locked"><Gavel/><h2>پیش‌نویس هنوز آماده نیست</h2><p>برای مشاهده رأی پیشنهادی، اجازه دهید همه عامل‌ها و مرحله صحت‌سنجی تکمیل شوند.</p></div>
  return <div className="verdict">
    <div className="verdict-banner"><ShieldCheck/><div><b>پیش‌نویس با موفقیت صحت‌سنجی شد</b><span>۴ استناد بررسی شد · ۱ مورد نیازمند توجه قاضی</span></div></div>
    <div className="document"><div className="document-kicker">به نام خدا · رأی پیشنهادی غیررسمی</div><h2>دادنامه پیشنهادی</h2><p>در خصوص دعوای شرکت سازه‌گستر به طرفیت شرکت نقش‌آور به خواسته مطالبه وجه قرارداد پیمانکاری، با توجه به اصل قرارداد، صورت‌وضعیت نهایی و نظریه کارشناسی نمونه، اصل اشتغال ذمه خوانده احراز می‌شود.</p><h3>منطوق پیشنهادی</h3><p>خوانده به پرداخت مبلغ <b>۷۲۰ میلیون تومان</b> بابت اصل خواسته و هزینه دادرسی متناسب در حق خواهان محکوم شود. بخش مازاد خواسته، با لحاظ خسارت تأخیر مستندشده، قابل پذیرش تشخیص داده نمی‌شود.</p><div className="judge-note"><AlertTriangle/><p><b>نقطه تصمیم انسانی:</b> نحوه محاسبه خسارت تأخیر و اصالت صورت‌جلسه تحویل باید پیش از امضای رأی توسط قاضی بررسی شود.</p></div></div>
    <div className="verdict-actions"><button className="secondary">دریافت گزارش کامل</button><button className="primary">ارسال برای بازبینی انسانی <ArrowLeft/></button></div>
  </div>
}

function Citations() {
  return <div className="citations"><div className="citation-summary"><BookOpenCheck/><div><b>اعتبارسنجی پایگاه دانش نمونه</b><span>آخرین بررسی نمایشی: امروز، ساعت ۱۰:۴۲</span></div><strong>۳ / ۳</strong></div>{legalCitations.map((c) => <article key={c.code}><div><h3>{c.code}</h3><p>{c.text}</p></div><div className="citation-tags"><span><CheckCircle2/>{c.status}</span><span className={c.relevance === 'نیازمند بررسی' ? 'review' : ''}>{c.relevance}</span></div></article>)}</div>
}

function UploadModal({ onClose, onPick, onStart, fileRef }: any) {
  const [file, setFile] = useState<File | null>(null)
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="upload-title"><button className="modal-close" onClick={onClose}><X/></button><span className="modal-icon"><Upload/></span><h2 id="upload-title">افزودن پرونده برای تحلیل</h2><p>یک PDF یا فایل صوتی جلسه انتخاب کنید. در این دمو، محتوای نمونه جایگزین پردازش واقعی می‌شود.</p><button className="dropzone" onClick={onPick}><FileText/><b>{file ? file.name : 'فایل را انتخاب کنید'}</b><small>PDF، MP3 یا WAV · حداکثر ۲۵ مگابایت</small></button><input ref={fileRef} hidden type="file" accept=".pdf,audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)}/><div className="privacy"><Shield/><span>شناسه‌های حساس در مرحله ادراک پوشانده می‌شوند.</span></div><button className="primary full" onClick={onStart}>{file ? 'افزودن و آغاز تحلیل' : 'اجرای محتوای نمونه'}<ArrowLeft/></button></div></div>
}

export default App
