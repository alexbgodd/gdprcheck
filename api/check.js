// /api/check.js — Vercel Serverless Function
// Fetches a URL and analyses it for GDPR/privacy signals

const GTM_PATTERNS = [
  'googletagmanager.com/gtm.js',
  'googletagmanager.com/ns.html',
  'gtm.js',
  "gtm('js'",
  'GTM-',
  'gtm-',
  'data-gtm',
  'window.dataLayer',
  'datalayer',
];

const TRACKERS = [
  // --- Analytics ---
  { name: 'Google Analytics',  category: 'analytics', patterns: ['google-analytics.com', 'googletagmanager.com', 'gtag(', "ga('send", 'ga("send'] },
  { name: 'Adobe Analytics',   category: 'analytics', patterns: ['omtrdc.net', 's_code.js', 'AppMeasurement.js', 'sc.omtrdc.net'] },
  { name: 'Amplitude',         category: 'analytics', patterns: ['cdn.amplitude.com', 'amplitude.getInstance'] },
  { name: 'Mixpanel',          category: 'analytics', patterns: ['cdn.mxpnl.com', 'mixpanel.track'] },
  { name: 'Segment',           category: 'analytics', patterns: ['cdn.segment.com', 'analytics.identify'] },
  { name: 'Yandex Metrica',    category: 'analytics', patterns: ['mc.yandex.ru', 'ym('] },
  { name: 'Microsoft Clarity', category: 'analytics', patterns: ['clarity.ms', 'clarity('] },
  { name: 'Hotjar',            category: 'analytics', patterns: ['hotjar.com', 'hjid', '_hjSettings'] },

  // --- Advertising ---
  { name: 'Facebook Pixel',    category: 'advertising', patterns: ['connect.facebook.net', 'fbq(', 'fbevents.js'] },
  { name: 'Google Ads',        category: 'advertising', patterns: ['googleadservices.com', 'google_conversion', 'gtag_report_conversion', 'adwords.google.com'] },
  { name: 'Bing Ads',          category: 'advertising', patterns: ['bat.bing.com', 'uetq'] },
  { name: 'Pinterest Tag',     category: 'advertising', patterns: ['pintrk(', 's.pinimg.com', 'ct.pinterest.com'] },
  { name: 'Snapchat Pixel',    category: 'advertising', patterns: ['sc-static.net', 'snaptr('] },
  { name: 'TikTok Pixel',      category: 'advertising', patterns: ['analytics.tiktok.com', 'ttq.'] },
  { name: 'Criteo',            category: 'advertising', patterns: ['static.criteo.net', 'criteo.com', 'Criteo.PushEvent'] },
  { name: 'Taboola',           category: 'advertising', patterns: ['cdn.taboola.com', '_taboola'] },
  { name: 'Outbrain',          category: 'advertising', patterns: ['widgets.outbrain.com', 'OBR.extern'] },
  { name: 'LinkedIn Insight',  category: 'advertising', patterns: ['snap.licdn.com', '_linkedin_partner'] },
  { name: 'Twitter/X Pixel',   category: 'advertising', patterns: ['static.ads-twitter.com', 'twq('] },

  // --- Social ---
  { name: 'Facebook SDK',      category: 'social', patterns: ['connect.facebook.net/en_US/sdk', 'connect.facebook.net/bg_BG/sdk', 'fb-root', 'fb:like'] },
  { name: 'Twitter/X Widget',  category: 'social', patterns: ['platform.twitter.com/widgets.js', 'twitter-share-button', 'twitter-follow-button'] },
  { name: 'LinkedIn Widget',   category: 'social', patterns: ['platform.linkedin.com/in.js', 'linkedin-share'] },

  // --- Video ---
  { name: 'YouTube Embed',     category: 'video', patterns: ['youtube.com/embed', 'youtube-nocookie.com/embed', 'ytd-', 'yt.be'] },
  { name: 'Vimeo Embed',       category: 'video', patterns: ['player.vimeo.com/video', 'vimeo.com/video'] },

  // --- Chat ---
  { name: 'Intercom',          category: 'chat', patterns: ['intercom.io', 'Intercom('] },
  { name: 'Zendesk',           category: 'chat', patterns: ['static.zdassets.com', 'zopim.com', 'ze-snippet'] },
  { name: 'Drift',             category: 'chat', patterns: ['js.driftt.com', 'drift.load'] },
  { name: 'Tawk.to',           category: 'chat', patterns: ['embed.tawk.to', 'tawk.to'] },
  { name: 'Freshchat',         category: 'chat', patterns: ['wchat.freshchat.com', 'freshchat.com'] },
  { name: 'Crisp Chat',        category: 'chat', patterns: ['crisp.chat', '$crisp'] },
];

const CONSENT_KEYWORDS = [
  // Platforms (script src / class names)
  'cookiebot', 'onetrust', 'otbannersdk', 'optanon', 'cdn.cookiepro.com',
  'tarteaucitron', 'cookiepro', 'cookieconsent', 'cookie-consent',
  'gdpr-consent', 'cookie_notice', 'axeptio', 'quantcast', 'trustarc',
  'usercentrics', 'didomi', 'complianz', 'cookie-law-info',
  // Natural language (BG + EN)
  'cookie notice', 'бисквит', 'приемам бисквит', 'бисквитки',
  'cookie съгласие', 'we use cookies', 'използваме бисквитки',
  'приемане на всички', 'отхвърляне на всички',
];

const PRIVACY_KEYWORDS = [
  'privacy policy', 'политика за поверителност', 'лични данни',
  'поверителност', 'privacy-policy', 'gdpr', 'защита на данни',
  'защита на личните данни', 'обработване на данни', 'декларация за поверителност',
  'декларация за защита', 'правила за поверителност',
];

const SECURITY_HEADERS = [
  'x-frame-options',
  'content-security-policy',
  'x-content-type-options',
  'strict-transport-security',
  'referrer-policy',
];

const CATEGORY_LABELS = {
  analytics:   'Аналитика',
  advertising: 'Реклама',
  social:      'Социални',
  video:       'Видео',
  chat:        'Чат',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Липсва параметър url' });

  let targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;

  let parsedUrl;
  try { parsedUrl = new URL(targetUrl); }
  catch { return res.status(400).json({ error: 'Невалиден URL' }); }

  const isHttps = parsedUrl.protocol === 'https:';

  let html = '';
  let responseHeaders = {};
  let fetchError = null;
  let finalUrl = targetUrl;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GDPRcheck-bot/1.0; +https://gdprcheck.bg)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'bg,en;q=0.9',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    finalUrl = response.url;
    responseHeaders = Object.fromEntries(response.headers.entries());
    html = await response.text();
  } catch (err) {
    fetchError = err.name === 'AbortError'
      ? 'Сайтът не отговори навреме (timeout)'
      : `Грешка при зареждане: ${err.message}`;
  }

  const htmlLower = html.toLowerCase();

  // GTM
  const hasGTM = GTM_PATTERNS.some(p => htmlLower.includes(p.toLowerCase()));

  // Trackers — grouped by category
  const foundTrackers = TRACKERS
    .filter(t => t.patterns.some(p => htmlLower.includes(p.toLowerCase())))
    .map(t => ({ name: t.name, category: t.category }));

  const trackersByCategory = {};
  for (const t of foundTrackers) {
    if (!trackersByCategory[t.category]) trackersByCategory[t.category] = [];
    trackersByCategory[t.category].push(t.name);
  }

  // Google Fonts
  const hasGoogleFonts = htmlLower.includes('fonts.googleapis.com') || htmlLower.includes('fonts.gstatic.com');

  // Risky forms (action= over http://)
  const riskyForms = (html.match(/action=["'][^"']*["']/gi) || [])
    .filter(a => a.toLowerCase().includes('http://'))
    .length > 0;

  // Consent & Privacy
  const hasConsent = CONSENT_KEYWORDS.some(k => htmlLower.includes(k.toLowerCase()));
  const hasPrivacyLink = PRIVACY_KEYWORDS.some(k => htmlLower.includes(k.toLowerCase()));

  // Security headers
  const secHeaders = SECURITY_HEADERS.map(h => ({
    name: h,
    present: h in responseHeaders,
  }));

  // Score (0-100) — video embeds are informational only, not penalised
  const penalisedTrackers = foundTrackers.filter(t => t.category !== 'video');
  let score = 0;
  if (isHttps) score += 20;
  if (hasConsent || penalisedTrackers.length === 0) score += 20;
  if (hasPrivacyLink) score += 20;
  if (!hasGoogleFonts) score += 10;
  if (!riskyForms) score += 10;
  const headerScore = Math.round((secHeaders.filter(h => h.present).length / SECURITY_HEADERS.length) * 20);
  score += headerScore;

  return res.status(200).json({
    url: finalUrl,
    checkedAt: new Date().toISOString(),
    fetchError,
    https: isHttps,
    trackers: foundTrackers.map(t => t.name),
    trackersByCategory,
    infoCategories: ['video'],
    categoryLabels: CATEGORY_LABELS,
    hasGTM,
    hasGoogleFonts,
    riskyForms,
    hasConsentBanner: hasConsent,
    hasPrivacyPolicy: hasPrivacyLink,
    securityHeaders: secHeaders,
    score,
  });
}
