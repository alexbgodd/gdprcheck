import { useState, useRef } from 'react'

// ── translations ──────────────────────────────────────────────
const T = {
  bg: {
    tagline: 'Безплатна GDPR проверка',
    headline: 'Вашият сайт спазва ли закона?',
    sub: 'Въведете URL и получете пълен анализ за GDPR съответствие, достъпност, сигурност и SEO — безплатно, за секунди.',
    placeholder: 'https://example.bg',
    scanBtn: 'ПРОВЕРИ →',
    scanning: 'АНАЛИЗИРА...',
    quickTest: 'Бърз тест:',
    categories: ['GDPR', 'Достъпност', 'Сигурност', 'SEO'],
    score: 'Обща оценка',
    passed: 'преминати',
    warnings: 'предупреждения',
    failed: 'проблема',
    verdicts: ['Отличен резултат', 'Частично съответствие', 'Сериозни проблеми'],
    verdictSubs: [
      'Сайтът показва добри показатели за съответствие.',
      'Открити са проблеми. Препоръчва се преглед.',
      'Открити са значителни нарушения. Необходими са действия.'
    ],
    copyReport: '📋 Копирай доклад',
    copied: '✓ Копирано!',
    downloadReport: '⬇ Свали .txt',
    disclaimer: '⚠ Инструментът извършва евристичен анализ на публично достъпни данни. Не представлява правен съвет и не замества одит от квалифициран специалист по защита на данните.',
    footerNote: 'Разработен от',
    footerRole: 'QA & Дигитален специалист · София, България',
    langSwitch: 'EN',
    initMsg: 'Инициализиране на GDPRcheck.bg v1.0...',
    connectMsg: 'Свързване със сайта чрез прокси...',
    fetchOk: 'Страницата е заредена —',
    fetchChars: 'символа.',
    fetchFail: 'Неуспешно зареждане. Режим само по URL.',
    runningChecks: 'Изпълняват се',
    checksLabel: 'проверки...',
    auditDone: 'Анализът завърши — Оценка:',
  },
  en: {
    tagline: 'Free GDPR Compliance Checker',
    headline: 'Is your website compliant?',
    sub: 'Enter a URL and get a full analysis for GDPR compliance, accessibility, security and SEO — free, in seconds.',
    placeholder: 'https://example.com',
    scanBtn: 'CHECK →',
    scanning: 'CHECKING...',
    quickTest: 'Quick test:',
    categories: ['GDPR', 'Accessibility', 'Security', 'SEO'],
    score: 'Overall Score',
    passed: 'passed',
    warnings: 'warnings',
    failed: 'failed',
    verdicts: ['Excellent result', 'Partial compliance', 'Significant issues'],
    verdictSubs: [
      'The site shows good compliance indicators.',
      'Issues detected. Review and remediation recommended.',
      'Significant compliance failures detected. Action required.'
    ],
    copyReport: '📋 Copy report',
    copied: '✓ Copied!',
    downloadReport: '⬇ Download .txt',
    disclaimer: '⚠ This tool performs heuristic analysis of publicly available data. It does not constitute legal advice and cannot replace a full audit by a qualified data protection professional.',
    footerNote: 'Built by',
    footerRole: 'QA & Digital Specialist · Sofia, Bulgaria',
    langSwitch: 'БГ',
    initMsg: 'Initialising GDPRcheck.bg v1.0...',
    connectMsg: 'Connecting to site via proxy...',
    fetchOk: 'Page fetched —',
    fetchChars: 'characters.',
    fetchFail: 'Fetch failed. URL-only mode active.',
    runningChecks: 'Running',
    checksLabel: 'checks...',
    auditDone: 'Audit complete — Score:',
  }
}

// ── checks ────────────────────────────────────────────────────
const checks = [
  {
    cat: 0,
    id: 'https',
    title: { bg: 'HTTPS — Сигурна връзка', en: 'HTTPS — Secure Connection' },
    law: 'Чл. 32 GDPR',
    desc: { bg: 'GDPR изисква подходящи технически мерки за защита на данните при пренос. HTTPS е базово изискване.', en: 'GDPR requires appropriate technical measures to protect personal data in transit. HTTPS is a baseline requirement.' },
    run: (url) => {
      if (url.startsWith('https://')) return { status: 'pass', note: { bg: 'HTTPS потвърден. Данните при пренос са криптирани.', en: 'HTTPS confirmed. Data in transit is encrypted.' } }
      return { status: 'fail', note: { bg: 'Сайтът не използва HTTPS. Сериозен пропуск в сигурността.', en: 'Site does not use HTTPS. Fundamental security failure.' } }
    }
  },
  {
    cat: 0,
    id: 'privacy',
    title: { bg: 'Политика за поверителност', en: 'Privacy Policy' },
    law: 'Чл. 13–14 GDPR · ЗЗЛД',
    desc: { bg: 'Всеки сайт събиращ лични данни трябва да предоставя информация за обработването, съхранението и правата на потребителите.', en: 'Sites collecting personal data must provide information about processing, retention and user rights.' },
    run: (url, html) => {
      const l = html.toLowerCase()
      const sigs = ['политика за поверителност', 'лични данни', 'privacy policy', 'privacy notice', 'gdpr', '/privacy', 'защита на данни', 'ззлд']
      if (sigs.some(s => l.includes(s))) return { status: 'pass', note: { bg: 'Открита е препратка към политика за поверителност.', en: 'Privacy policy reference detected.' } }
      return { status: 'fail', note: { bg: 'Не е открита политика за поверителност. Изисква се по GDPR чл. 13.', en: 'No privacy policy detected. Required under GDPR Art. 13.' } }
    }
  },
  {
    cat: 0,
    id: 'cookie',
    title: { bg: 'Cookie съгласие', en: 'Cookie Consent' },
    law: 'Чл. 6 GDPR · ePrivacy',
    desc: { bg: 'Несъществени бисквитки изискват изрично информирано съгласие преди поставяне. Необходим е cookie банер.', en: 'Non-essential cookies require explicit informed consent before being set.' },
    run: (url, html) => {
      const l = html.toLowerCase()
      const sigs = ['бисквитки', 'cookie', 'consent', 'cookiebot', 'onetrust', 'cookiepro', 'cc-', 'cookie-banner']
      const found = sigs.filter(s => l.includes(s))
      if (found.length >= 2) return { status: 'pass', note: { bg: `Открит механизъм за cookie съгласие (${found.slice(0,2).join(', ')}).`, en: `Cookie consent signals detected (${found.slice(0,2).join(', ')}).` } }
      if (found.length === 1) return { status: 'warn', note: { bg: `Слаб сигнал (${found[0]}). Препоръчва се ръчна проверка.`, en: `Weak signal (${found[0]}). Manual review recommended.` } }
      return { status: 'fail', note: { bg: 'Не е открит механизъм за cookie съгласие.', en: 'No cookie consent mechanism detected.' } }
    }
  },
  {
    cat: 0,
    id: 'dpo',
    title: { bg: 'DPO / Контакт за защита на данни', en: 'DPO / Data Protection Contact' },
    law: 'Чл. 37–39 GDPR',
    desc: { bg: 'Някои организации са задължени да назначат DPO. Всеки администратор трябва да предоставя контакт за субектите на данни.', en: 'Some organisations must appoint a DPO. All controllers must provide a contact point for data subjects.' },
    run: (url, html) => {
      const l = html.toLowerCase()
      const sigs = ['длъжностно лице', 'dpo', 'dpo@', 'data protection officer', 'защита на данни']
      if (sigs.some(s => l.includes(s))) return { status: 'pass', note: { bg: 'Открита е препратка към DPO или контакт за защита на данни.', en: 'DPO or data protection contact reference found.' } }
      return { status: 'info', note: { bg: 'Не е открит DPO контакт. Изисква се за определени организации по чл. 37.', en: 'No DPO reference found. Required for certain organisations under Art. 37.' } }
    }
  },
  {
    cat: 1,
    id: 'accessibility_decl',
    title: { bg: 'Декларация за достъпност', en: 'Accessibility Declaration' },
    law: 'Директива 2016/2102 · ЗЕУ',
    desc: { bg: 'Публичните органи са законово задължени да публикуват декларация за достъпност на сайта си.', en: 'Public bodies are legally required to publish an accessibility declaration on their website.' },
    run: (url, html) => {
      const l = html.toLowerCase()
      const sigs = ['декларация за достъпност', 'accessibility statement', 'accessibility declaration', 'wcag', 'достъпност']
      const found = sigs.filter(s => l.includes(s))
      if (found.length >= 2) return { status: 'pass', note: { bg: 'Открена е декларация за достъпност.', en: 'Accessibility declaration detected.' } }
      if (found.length === 1) return { status: 'warn', note: { bg: `Слаб сигнал (${found[0]}). Пълна декларация може да липсва.`, en: `Weak signal (${found[0]}). Full declaration may be missing.` } }
      return { status: 'warn', note: { bg: 'Не е открита декларация за достъпност. Задължителна за публични органи.', en: 'No accessibility declaration found. Required for public bodies.' } }
    }
  },
  {
    cat: 1,
    id: 'lang',
    title: { bg: 'Деклариран език на страницата', en: 'Page Language Declaration' },
    law: 'WCAG 3.1.1 · Директива 2016/2102',
    desc: { bg: 'Страниците трябва да декларират своя език чрез атрибута lang. Необходимо е за екранни четци и асистивни технологии.', en: 'Pages must declare their language using the lang attribute. Essential for screen readers.' },
    run: (url, html) => {
      const m = html.match(/<html[^>]*lang=["']([^"']+)["']/i)
      if (m) return { status: 'pass', note: { bg: `Деклариран език: "${m[1]}". Екранните четци могат да интерпретират съдържанието правилно.`, en: `Language declared: "${m[1]}". Screen readers can correctly interpret content.` } }
      return { status: 'fail', note: { bg: 'Не е намерен атрибут lang в <html> елемента. Изисква се по WCAG 3.1.1.', en: 'No lang attribute on <html> element. Required under WCAG 3.1.1.' } }
    }
  },
  {
    cat: 1,
    id: 'alt',
    title: { bg: 'Alt текст на изображенията', en: 'Image Alt Text' },
    law: 'WCAG 1.1.1 · Директива 2016/2102',
    desc: { bg: 'Всички информативни изображения трябва да имат описателен alt текст за потребителите на екранни четци.', en: 'All informative images must have descriptive alt text for screen reader users.' },
    run: (url, html) => {
      const imgs = html.match(/<img[^>]*>/gi) || []
      if (imgs.length === 0) return { status: 'info', note: { bg: 'Не са открити изображения на тази страница.', en: 'No images detected on this page.' } }
      const withAlt = imgs.filter(t => /alt=/i.test(t)).length
      const pct = Math.round((withAlt / imgs.length) * 100)
      if (withAlt === imgs.length) return { status: 'pass', note: { bg: `Всички ${imgs.length} изображения имат alt атрибут.`, en: `All ${imgs.length} images have alt attributes.` } }
      if (pct >= 70) return { status: 'warn', note: { bg: `${withAlt}/${imgs.length} изображения имат alt текст. ${imgs.length - withAlt} липсват.`, en: `${withAlt}/${imgs.length} images have alt text. ${imgs.length - withAlt} missing.` } }
      return { status: 'fail', note: { bg: `Само ${pct}% от изображенията имат alt текст. Сериозен проблем с достъпността.`, en: `Only ${pct}% of images have alt text. Significant accessibility issue.` } }
    }
  },
  {
    cat: 1,
    id: 'mobile',
    title: { bg: 'Мобилна / Responsive версия', en: 'Mobile / Responsive Design' },
    law: 'Директива 2016/2102 · Чл. 1',
    desc: { bg: 'Публичните органи трябва да осигуряват достъпно мобилно съдържание. Viewport метатагът е базово изискване.', en: 'Public bodies must ensure mobile-accessible content. Viewport meta tag is a baseline requirement.' },
    run: (url, html) => {
      const l = html.toLowerCase()
      const hasViewport = l.includes('viewport')
      const hasResponsive = l.includes('@media') || l.includes('responsive')
      if (hasViewport && hasResponsive) return { status: 'pass', note: { bg: 'Viewport мета и responsive сигнали са открити.', en: 'Viewport meta and responsive signals detected.' } }
      if (hasViewport) return { status: 'warn', note: { bg: 'Viewport мета е открит, но responsive CSS може да липсва.', en: 'Viewport meta found, but responsive CSS may be missing.' } }
      return { status: 'fail', note: { bg: 'Не е открит viewport мета таг. Сайтът може да не е достъпен на мобилни устройства.', en: 'No viewport meta tag. Site may not be accessible on mobile devices.' } }
    }
  },
  {
    cat: 2,
    id: 'trackers',
    title: { bg: 'Трети страни и тракери', en: 'Third-Party Trackers' },
    law: 'Чл. 28 + 46 GDPR',
    desc: { bg: 'Използването на Google Analytics, Facebook Pixel и подобни инструменти представлява предаване на данни на трети страни и изисква разкриване и съгласие.', en: 'Use of analytics and tracking tools involves data transfer to third parties and requires disclosure and consent.' },
    run: (url, html) => {
      const l = html.toLowerCase()
      const trackers = [
        { name: 'Google Analytics', sigs: ['google-analytics', 'gtag(', 'gtm.js', 'googletagmanager'] },
        { name: 'Facebook Pixel', sigs: ['fbq(', 'connect.facebook.net'] },
        { name: 'Hotjar', sigs: ['hotjar'] },
        { name: 'Google Fonts (external)', sigs: ['fonts.googleapis.com'] },
      ]
      const found = trackers.filter(t => t.sigs.some(s => l.includes(s))).map(t => t.name)
      if (found.length === 0) return { status: 'pass', note: { bg: 'Не са открити известни тракери на трети страни.', en: 'No common third-party trackers detected.' } }
      return { status: 'warn', note: { bg: `Открити услуги: ${found.join(', ')}. Изисква се разкриване и съгласие по GDPR чл. 28.`, en: `Detected: ${found.join(', ')}. GDPR Art. 28 data processing agreements required.` } }
    }
  },
  {
    cat: 3,
    id: 'title',
    title: { bg: 'Meta Title', en: 'Meta Title' },
    law: 'SEO Best Practice',
    desc: { bg: 'Meta title е критичен фактор за SEO класиране и видимост в търсачките. Трябва да е между 50–60 символа.', en: 'Meta title is critical for SEO ranking and search engine visibility. Should be 50–60 characters.' },
    run: (url, html) => {
      const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (!m) return { status: 'fail', note: { bg: 'Не е открит meta title. Сериозен SEO проблем.', en: 'No meta title found. Significant SEO issue.' } }
      const len = m[1].trim().length
      if (len >= 30 && len <= 65) return { status: 'pass', note: { bg: `Title: "${m[1].trim().slice(0,50)}..." (${len} символа) — добра дължина.`, en: `Title: "${m[1].trim().slice(0,50)}..." (${len} chars) — good length.` } }
      return { status: 'warn', note: { bg: `Title е ${len} символа. Препоръчителното е 50–60.`, en: `Title is ${len} characters. Recommended: 50–60.` } }
    }
  },
  {
    cat: 3,
    id: 'description',
    title: { bg: 'Meta Description', en: 'Meta Description' },
    law: 'SEO Best Practice',
    desc: { bg: 'Meta description влияе на CTR в търсачките. Трябва да е между 120–160 символа и да описва съдържанието.', en: 'Meta description affects CTR in search results. Should be 120–160 characters.' },
    run: (url, html) => {
      const m = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)
      if (!m) return { status: 'fail', note: { bg: 'Не е открита meta description. SEO пропуск.', en: 'No meta description found. SEO gap.' } }
      const len = m[1].length
      if (len >= 100 && len <= 165) return { status: 'pass', note: { bg: `Description: ${len} символа — добра дължина.`, en: `Description: ${len} chars — good length.` } }
      return { status: 'warn', note: { bg: `Description е ${len} символа. Препоръчителното е 120–160.`, en: `Description is ${len} characters. Recommended: 120–160.` } }
    }
  },
  {
    cat: 3,
    id: 'og',
    title: { bg: 'Open Graph тагове', en: 'Open Graph Tags' },
    law: 'SEO / Social Sharing',
    desc: { bg: 'Open Graph таговете контролират как сайтът изглежда при споделяне в социалните мрежи.', en: 'Open Graph tags control how the site appears when shared on social networks.' },
    run: (url, html) => {
      const l = html.toLowerCase()
      const hasOg = l.includes('og:title') && l.includes('og:description')
      if (hasOg) return { status: 'pass', note: { bg: 'Open Graph тагове са открити. Споделянето в социалните мрежи е оптимизирано.', en: 'Open Graph tags detected. Social sharing is optimised.' } }
      if (l.includes('og:')) return { status: 'warn', note: { bg: 'Частични Open Graph тагове. Препоръчва се og:title и og:description.', en: 'Partial Open Graph tags. og:title and og:description recommended.' } }
      return { status: 'warn', note: { bg: 'Не са открити Open Graph тагове. Споделянето в социалните мрежи не е оптимизирано.', en: 'No Open Graph tags. Social sharing not optimised.' } }
    }
  },
]

const statusMeta = {
  pass: { label: { bg: 'ОК', en: 'PASS' }, color: 'var(--green)', dimColor: 'var(--green-dim)', icon: '✓' },
  fail: { label: { bg: 'ПРОБЛЕМ', en: 'FAIL' }, color: 'var(--red)', dimColor: 'var(--red-dim)', icon: '✗' },
  warn: { label: { bg: 'ПРЕДУПР.', en: 'WARN' }, color: 'var(--yellow)', dimColor: 'var(--yellow-dim)', icon: '⚠' },
  info: { label: { bg: 'ИНФО', en: 'INFO' }, color: 'var(--blue)', dimColor: 'var(--blue-dim)', icon: 'ℹ' },
}

const quickUrls = ['https://www.government.bg', 'https://www.parliament.bg', 'https://www.sofia.bg', 'https://www.mvr.bg', 'https://www.nap.bg']

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

export default function App() {
  const [lang, setLang] = useState('bg')
  const t = T[lang]
  const [url, setUrl] = useState('')
  const [scanning, setScanning] = useState(false)
  const [logs, setLogs] = useState([])
  const [results, setResults] = useState(null)
  const [copyLabel, setCopyLabel] = useState(null)
  const [activeTab, setActiveTab] = useState(null)
  const termRef = useRef(null)

  const addLog = (msg, type = '') => {
    setLogs(prev => [...prev, { msg, type, id: Date.now() + Math.random() }])
    setTimeout(() => { if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight }, 50)
  }

  const scan = async () => {
    let target = url.trim()
    if (!target) return
    if (!target.startsWith('http')) target = 'https://' + target

    setScanning(true)
    setLogs([])
    setResults(null)
    setActiveTab(null)

    addLog(t.initMsg, 'sys')
    await sleep(300)
    addLog(`Target: ${target}`)
    await sleep(250)
    addLog(t.connectMsg)
    await sleep(400)

    let html = ''
    try {
      const resp = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(target)}`, { signal: AbortSignal.timeout(10000) })
      const data = await resp.json()
      html = data.contents || ''
      if (html.length > 100) addLog(`${t.fetchOk} ${html.length.toLocaleString()} ${t.fetchChars}`, 'ok')
      else addLog(t.fetchFail, 'warn')
    } catch { addLog(t.fetchFail, 'warn') }

    await sleep(300)
    addLog(`${t.runningChecks} ${checks.length} ${t.checksLabel}`, 'sys')
    await sleep(200)

    const res = []
    for (const check of checks) {
      await sleep(140 + Math.random() * 80)
      const r = check.run(target, html)
      const sm = statusMeta[r.status]
      addLog(`[${sm.label[lang]}] ${check.title[lang]}`, r.status === 'pass' ? 'ok' : r.status === 'fail' ? 'err' : r.status === 'warn' ? 'warn' : 'info')
      res.push({ check, r })
    }

    await sleep(300)
    const pass = res.filter(x => x.r.status === 'pass').length
    const fail = res.filter(x => x.r.status === 'fail').length
    const warn = res.filter(x => x.r.status === 'warn').length
    const score = Math.round((pass / checks.length) * 100)
    addLog(`${t.auditDone} ${score}/100 | ${pass}/${warn}/${fail}`, 'ok')

    setResults({ items: res, pass, fail, warn, score, url: target })
    setScanning(false)
  }

  const buildReport = () => {
    if (!results) return ''
    const lines = [
      `GDPRCHECK.BG — AUDIT REPORT`,
      '='.repeat(50),
      `URL: ${results.url}`,
      `Date: ${new Date().toLocaleString('bg-BG')}`,
      `Score: ${results.score}/100`,
      '='.repeat(50), ''
    ]
    results.items.forEach(({ check, r }) => {
      lines.push(`[${statusMeta[r.status].label[lang]}] ${check.title[lang]}`)
      lines.push(`Law: ${check.law}`)
      lines.push(`Result: ${r.note[lang]}`)
      lines.push('')
    })
    lines.push('='.repeat(50))
    lines.push(`Generated by GDPRcheck.bg — https://gdprcheck.bg`)
    return lines.join('\n')
  }

  const copyReport = () => {
    navigator.clipboard.writeText(buildReport()).then(() => {
      setCopyLabel(t.copied)
      setTimeout(() => setCopyLabel(null), 2000)
    })
  }

  const downloadReport = () => {
    const blob = new Blob([buildReport()], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `gdpr-audit-${new Date().toISOString().slice(0,10)}.txt`
    a.click()
  }

  const score = results?.score ?? null
  const scoreColor = score === null ? 'var(--green)' : score >= 75 ? 'var(--green)' : score >= 45 ? 'var(--yellow)' : 'var(--red)'
  const verdictIdx = score === null ? 0 : score >= 75 ? 0 : score >= 45 ? 1 : 2

  const catItems = activeTab !== null ? results?.items.filter(x => x.check.cat === activeTab) : results?.items

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1rem 4rem' }}>

      {/* NAV */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '1rem', fontWeight: 700, color: 'var(--green)', letterSpacing: '-0.02em' }}>
          GDPR<span style={{ color: 'var(--text)' }}>check</span><span style={{ color: 'var(--muted)' }}>.bg</span>
        </span>
        <button onClick={() => setLang(l => l === 'bg' ? 'en' : 'bg')}
          style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', padding: '0.3rem 0.8rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--muted)', cursor: 'pointer' }}>
          {t.langSwitch}
        </button>
      </nav>

      {/* HERO */}
      <header style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', letterSpacing: '0.14em', color: 'var(--green)', border: '1px solid var(--green)', display: 'inline-block', padding: '0.2rem 0.8rem', borderRadius: 2, marginBottom: '1rem' }}>
          {t.tagline}
        </div>
        <h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 600, color: '#fff', marginBottom: '0.8rem', lineHeight: 1.15 }}>{t.headline}</h1>
        <p style={{ fontSize: '0.92rem', color: 'var(--muted)', maxWidth: '52ch', margin: '0 auto', lineHeight: 1.7 }}>{t.sub}</p>
      </header>

      {/* QUICK LINKS */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--muted)', alignSelf: 'center' }}>{t.quickTest}</span>
        {quickUrls.map(u => (
          <button key={u} onClick={() => setUrl(u)}
            style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', padding: '0.28rem 0.7rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--muted)', cursor: 'pointer' }}>
            {u.replace('https://www.', '')}
          </button>
        ))}
      </div>

      {/* INPUT */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '1.3rem', marginBottom: '1.2rem' }}>
        <div style={{ display: 'flex', gap: '0.7rem' }}>
          <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && !scanning && scan()}
            placeholder={t.placeholder} type="url"
            style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.75rem 1rem', fontFamily: 'var(--mono)', fontSize: '0.85rem', color: 'var(--text)', outline: 'none' }} />
          <button onClick={scan} disabled={scanning || !url.trim()}
            style={{ background: scanning ? 'var(--surface2)' : 'var(--green)', color: scanning ? 'var(--muted)' : '#0a0f1e', border: 'none', borderRadius: 6, padding: '0.75rem 1.6rem', fontFamily: 'var(--mono)', fontSize: '0.85rem', fontWeight: 700, cursor: scanning ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
            {scanning ? t.scanning : t.scanBtn}
          </button>
        </div>
      </div>

      {/* TERMINAL */}
      {logs.length > 0 && (
        <div ref={termRef} style={{ background: '#060b12', border: '1px solid var(--border)', borderRadius: 8, padding: '1.1rem 1.3rem', marginBottom: '1.2rem', maxHeight: 200, overflowY: 'auto', fontFamily: 'var(--mono)', fontSize: '0.75rem', lineHeight: 1.9 }}>
          {logs.map(l => (
            <div key={l.id} style={{ color: l.type === 'ok' ? 'var(--green)' : l.type === 'err' ? 'var(--red)' : l.type === 'warn' ? 'var(--yellow)' : l.type === 'sys' ? '#a78bfa' : 'var(--muted)' }}>
              {'> '}{l.msg}{scanning && l === logs[logs.length - 1] && <span style={{ display: 'inline-block', width: 7, height: 12, background: 'var(--green)', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />}
            </div>
          ))}
          <style>{`@keyframes blink{50%{opacity:0}}`}</style>
        </div>
      )}

      {/* SCORE */}
      {results && (
        <>
          <div style={{ background: 'var(--surface)', border: `1px solid ${scoreColor}33`, borderRadius: 8, padding: '1.5rem', marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1.5rem', alignItems: 'center' }}>
            <div style={{ width: 90, height: 90, borderRadius: '50%', border: `3px solid ${scoreColor}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '1.8rem', fontWeight: 700, color: scoreColor, lineHeight: 1 }}>{score}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--muted)' }}>/100</span>
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', marginBottom: '0.2rem' }}>{t.verdicts[verdictIdx]}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.7rem' }}>{t.verdictSubs[verdictIdx]}</div>
              <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: '0.5rem' }}>
                <div style={{ height: '100%', width: `${score}%`, background: scoreColor, borderRadius: 3, transition: 'width 1s ease' }} />
              </div>
              <div style={{ display: 'flex', gap: '1rem', fontFamily: 'var(--mono)', fontSize: '0.68rem' }}>
                <span style={{ color: 'var(--green)' }}>✓ {results.pass} {t.passed}</span>
                <span style={{ color: 'var(--yellow)' }}>⚠ {results.warn} {t.warnings}</span>
                <span style={{ color: 'var(--red)' }}>✗ {results.fail} {t.failed}</span>
              </div>
            </div>
          </div>

          {/* EXPORT */}
          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <button onClick={copyReport} style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', padding: '0.45rem 0.9rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text)', cursor: 'pointer' }}>
              {copyLabel || t.copyReport}
            </button>
            <button onClick={downloadReport} style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', padding: '0.45rem 0.9rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text)', cursor: 'pointer' }}>
              {t.downloadReport}
            </button>
          </div>

          {/* CATEGORY TABS */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
            <button onClick={() => setActiveTab(null)}
              style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', padding: '0.3rem 0.8rem', background: activeTab === null ? 'var(--green)' : 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, color: activeTab === null ? '#0a0f1e' : 'var(--muted)', cursor: 'pointer', fontWeight: activeTab === null ? 700 : 400 }}>
              Всички / All
            </button>
            {t.categories.map((cat, i) => (
              <button key={i} onClick={() => setActiveTab(activeTab === i ? null : i)}
                style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', padding: '0.3rem 0.8rem', background: activeTab === i ? 'var(--blue)' : 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, color: activeTab === i ? '#0a0f1e' : 'var(--muted)', cursor: 'pointer', fontWeight: activeTab === i ? 700 : 400 }}>
                {cat}
              </button>
            ))}
          </div>

          {/* RESULT ITEMS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '1.5rem' }}>
            {catItems?.map(({ check, r }) => {
              const sm = statusMeta[r.status]
              return (
                <div key={check.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.9rem 1.1rem', display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: '0.7rem', alignItems: 'start' }}>
                  <span style={{ color: sm.color, fontSize: '0.9rem', marginTop: '0.1rem' }}>{sm.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.83rem', fontWeight: 600, color: '#fff', marginBottom: '0.15rem' }}>{check.title[lang]}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '0.63rem', color: '#a78bfa', marginBottom: '0.25rem' }}>{check.law}</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--muted)', lineHeight: 1.5 }}>{check.desc[lang]}</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text)', lineHeight: 1.5, marginTop: '0.2rem' }}>{r.note[lang]}</div>
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', fontWeight: 700, padding: '0.18rem 0.5rem', borderRadius: 3, background: sm.dimColor, color: sm.color, whiteSpace: 'nowrap', alignSelf: 'center' }}>
                    {sm.label[lang]}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* DISCLAIMER */}
      <div style={{ background: 'var(--yellow-dim)', border: '1px solid #fbbf2430', borderRadius: 6, padding: '0.85rem 1.1rem', fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--yellow)', lineHeight: 1.6, marginBottom: '2rem' }}>
        {t.disclaimer}
      </div>

      {/* FOOTER */}
      <footer style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--muted)' }}>
        <div style={{ marginBottom: '0.3rem' }}>
          {t.footerNote} <a href="https://alexbgodd.github.io" style={{ color: 'var(--green)', textDecoration: 'none' }}>Alexander Marinkov</a> · {t.footerRole}
        </div>
        <div>GDPR EU 2016/679 · Directive 2016/2102 · ЗЗЛД · ЗЕУ</div>
      </footer>

    </div>
  )
}
