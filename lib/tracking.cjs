const { createHash, randomUUID } = require('node:crypto');
const { isIP } = require('node:net');
const ORIGINS = new Set(['https://help-ross.vercel.app', 'https://lojaonlinear.github.io']);
const TIERS = new Set([25, 50, 100, 150, 200, 500]);
const NAMES = new Set(['PageView', 'ViewContent', 'InitiateCheckout']);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const REFERENCE = /^lm1_([a-f0-9]{32})$/;
const RETENTION_DAYS = 30;

function sha256(value) { return createHash('sha256').update(String(value)).digest('hex'); }
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}
function cors(req, res) {
  const origin = req.headers.origin;
  if (!ORIGINS.has(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}
async function rawBody(req, limit = 16384) {
  let size = 0; const parts = [];
  for await (const part of req) {
    const bytes = Buffer.from(part); size += bytes.length;
    if (size > limit) throw new Error('payload_too_large');
    parts.push(bytes);
  }
  return Buffer.concat(parts);
}
async function bodyJSON(req) {
  if (req.body !== undefined) {
    const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(text) > 16384) throw new Error('payload_too_large');
    return JSON.parse(text);
  }
  return JSON.parse((await rawBody(req)).toString('utf8'));
}
function sourceURL(value, origin) {
  const url = new URL(value);
  if (!ORIGINS.has(url.origin) || url.origin !== origin) throw new Error('invalid_source');
  let pathname = url.pathname;
  if (url.origin === 'https://lojaonlinear.github.io') {
    if (!pathname.startsWith('/help-ross/')) throw new Error('invalid_source');
    pathname = pathname.slice('/help-ross'.length);
  }
  if (!['/', '/index.html', '/campaign-detail.html', '/campaigns.html', '/donate.html'].includes(pathname)) throw new Error('invalid_source');
  // No query strings, campaign descriptions, diagnoses or form values are sent.
  return url.origin + url.pathname;
}
function userData(req, body) {
  const data = {};
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  if (isIP(ip)) data.client_ip_address = ip;
  const agent = String(req.headers['user-agent'] || '').slice(0, 512);
  if (!agent) throw new Error('missing_user_agent');
  data.client_user_agent = agent;
  for (const field of ['fbp', 'fbc']) {
    if (typeof body[field] === 'string' && /^fb\.[12]\.\d{10,13}\.[A-Za-z0-9_.-]{1,512}$/.test(body[field])) data[field] = body[field];
  }
  if (UUID.test(body.visitor_id || '')) data.external_id = [sha256(body.visitor_id)];
  return data;
}
function validateEvent(req, body) {
  if (body.consent !== true || req.headers['sec-gpc'] === '1') throw new Error('consent_required');
  if (!NAMES.has(body.event_name) || !UUID.test(body.event_id || '')) throw new Error('invalid_event');
  const event = {
    event_name: body.event_name, event_id: body.event_id,
    event_time: Math.floor(Date.now() / 1000), action_source: 'website',
    event_source_url: sourceURL(body.event_source_url, req.headers.origin),
    user_data: userData(req, body)
  };
  if (body.event_name === 'InitiateCheckout') {
    if (!TIERS.has(body.value)) throw new Error('invalid_amount');
    event.custom_data = { value: body.value, currency: 'USD', num_items: 1 };
  }
  return event;
}
async function sendMeta(event, fetcher = fetch) {
  const pixel = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!/^\d{8,20}$/.test(pixel || '') || !token) throw new Error('meta_not_configured');
  const payload = { data: [event] };
  if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  const response = await fetcher(`https://graph.facebook.com/v27.0/${pixel}/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(10000)
  });
  const result = await response.json();
  if (!response.ok || result.events_received !== 1) {
    const error = new Error('meta_rejected');
    error.metaCode = result.error?.code;
    error.metaSubcode = result.error?.error_subcode;
    throw error;
  }
  return { received: result.events_received };
}
async function blobSDK() { return import('@vercel/blob'); }
async function readPrivate(pathname, blob) {
  const result = await blob.get(pathname, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return { data: await new Response(result.stream).json(), etag: result.blob.etag };
}
async function putPrivate(pathname, value, blob, options = {}) {
  return blob.put(pathname, JSON.stringify(value), {
    access: 'private', addRandomSuffix: false, contentType: 'application/json',
    ttlDays: RETENTION_DAYS, ...options
  });
}
async function createContext(req, body, blob) {
  if (!TIERS.has(body.value) || body.consent !== true || req.headers['sec-gpc'] === '1') throw new Error('invalid_context');
  const source = sourceURL(body.event_source_url, req.headers.origin);
  const id = randomUUID().replaceAll('-', '');
  await putPrivate(`meta-checkouts/${id}.json`, {
    value: body.value, currency: 'USD', consent: true, source,
    user_data: userData(req, body), createdAt: Date.now()
  }, blob, { allowOverwrite: false });
  return `lm1_${id}`;
}
function purchaseFromSession(session, stripeEvent, context) {
  if (session.mode !== 'payment' || session.payment_status !== 'paid') return null;
  if (!context || context.consent !== true || Date.now() - context.createdAt > RETENTION_DAYS * 86400000) return null;
  if (session.currency !== 'usd' || session.amount_total !== context.value * 100 || !TIERS.has(context.value)) throw new Error('amount_mismatch');
  const allowed = String(process.env.STRIPE_ALLOWED_PAYMENT_LINK_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.length) throw new Error('payment_links_not_configured');
  if (!allowed.includes(session.payment_link)) return null;
  if (!context.user_data?.client_user_agent) throw new Error('missing_checkout_context');
  return {
    event_name: 'Purchase', event_time: stripeEvent.created,
    event_id: `stripe_${session.id}`, action_source: 'website', event_source_url: context.source,
    user_data: context.user_data,
    custom_data: { value: session.amount_total / 100, currency: 'USD', order_id: session.id, num_items: 1 }
  };
}
const counters = new Map();
function rateAllowed(req) {
  const key = sha256(String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'));
  const now = Date.now();
  let counter = counters.get(key);
  if (!counter || now > counter.expires) { counter = { count: 0, expires: now + 300000 }; counters.set(key, counter); }
  if (counters.size > 10000) for (const [id, value] of counters) if (value.expires < now) counters.delete(id);
  return ++counter.count <= 90;
}
module.exports = { json, cors, rawBody, bodyJSON, sourceURL, userData, validateEvent, sendMeta, blobSDK, readPrivate, putPrivate, createContext, purchaseFromSession, rateAllowed, REFERENCE, TIERS };
