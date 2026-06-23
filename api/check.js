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
  { name: 'Google Analytics',   patterns: ['google-analytics.com', 'googletagmanager.com', 'gtag(', 'ga(\'send', 'ga("send'] },
  { name: 'Facebook Pixel',     patterns: ['connect.facebook.net', 'fbq(', 'fbevents.js'] },
  { name: 'Hotjar',             patterns: ['hotjar.com', 'hjid', '_hjSettings'] },
  { name: 'LinkedIn Insight',   patterns: ['snap.licdn.com', '_linkedin_partner'] },
  { name: 'Twitter/X Pixel',    patterns: ['static.ads-twitter.com', 'twq('] },
  { name: 'TikTok Pixel',       patterns: ['analytics.tiktok.com', 'ttq.'] },
  { name: 'Yandex Metrica',     patterns: ['mc.yandex.ru', 'ym('] },
  { name: 'Microsoft Clarity',  patterns: ['clarity.ms', 'clarity('] },
  { name: 'Intercom',           patterns: ['intercom.io', 'Intercom('] },
  { name: 'Crisp Chat',         patterns: ['crisp.chat', '$crisp'] },
];

const CONSENT_KEYWORDS = [
  'cookiebot', 'onetrust', 'tarteaucitron', 'cookiepro', 'cookieconsent',
  'cookie-consent', 'gdpr-consent', 'cookie_notice', 'cookie notice',
  'бисквит', 'приемам бисквит', 'cookie съгласие', 'consent',
  'we use cookies', 'използваме бисквитки',
];

const PRIVACY_KEYWORDS = [
  'privacy policy', 'политика за поверителност', 'лични данни',
  'поверителност', 'privacy-policy', 'gdpr', 'защита на данни',
];

const SECURITY_HEADERS = [
  'x-frame-options',
  'content-security-policy',
  'x-content-type-options',
  'strict-transport-security',
  'referrer-policy',
];

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Липсва параметър url' });
  }

  // Normalize URL
  let targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Невалиден URL' });
  }

  const isHttps = parsedUrl.protocol === 'https:';

  // Fetch the page
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
    fetchError = err.name === 'AbortError' ? 'Сайтът не отговори навреме (timeout)' : `Грешка при зареждане: ${err.message}`;
  }

  const htmlLower = html.toLowerCase();

  // GTM detection
  const hasGTM = GTM_PATTERNS.some(p => htmlLower.includes(p.toLowerCase()));

  // Trackers
  const foundTrackers = TRACKERS.filter(t =>
    t.patterns.some(p => htmlLower.includes(p.toLowerCase()))
  ).map(t => t.name);

  // Cookie consent
  const hasConsent = CONSENT_KEYWORDS.some(k => htmlLower.includes(k.toLowerCase()));

  // Privacy policy link
  const hasPrivacyLink = PRIVACY_KEYWORDS.some(k => htmlLower.includes(k.toLowerCase()));

  // Security headers present
  const secHeaders = SECURITY_HEADERS.map(h => ({
    name: h,
    present: h in responseHeaders,
  }));

  // Score (0-100)
  let score = 0;
  if (isHttps) score += 25;
  if (hasConsent || foundTrackers.length === 0) score += 25;
  if (hasPrivacyLink) score += 25;
  const headerScore = Math.round((secHeaders.filter(h => h.present).length / SECURITY_HEADERS.length) * 25);
  score += headerScore;

  return res.status(200).json({
    url: finalUrl,
    checkedAt: new Date().toISOString(),
    fetchError,
    https: isHttps,
    trackers: foundTrackers,
    hasGTM,
    hasConsentBanner: hasConsent,
    hasPrivacyPolicy: hasPrivacyLink,
    securityHeaders: secHeaders,
    score,
  });
}
