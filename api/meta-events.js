const t = require('../lib/tracking.cjs');
module.exports = async function handler(req, res) {
  if (req.method === 'GET') { t.cors(req, res); return t.json(res, 200, { pixelId: process.env.META_PIXEL_ID || null, enabled: /^\d{8,20}$/.test(process.env.META_PIXEL_ID || ''), capiConfigured: !!process.env.META_CAPI_ACCESS_TOKEN }); }
  if (!t.cors(req, res)) return t.json(res, 403, { ok: false });
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return t.json(res, 405, { ok: false });
  if (!String(req.headers['content-type']).startsWith('application/json')) return t.json(res, 415, { ok: false });
  if (!t.rateAllowed(req)) return t.json(res, 429, { ok: false });
  try {
    const body = await t.bodyJSON(req);
    if (body.action === 'checkout_context') {
      const reference = await t.createContext(req, body, await t.blobSDK());
      return t.json(res, 200, { ok: true, reference });
    }
    const event = t.validateEvent(req, body);
    const result = await t.sendMeta(event);
    return t.json(res, 200, { ok: true, eventId: event.event_id, ...result });
  } catch (error) {
    const invalid = /^(invalid_|consent_|missing_user_agent|payload_too_large)/.test(error.message);
    if (!invalid) console.error('Meta delivery failed', { code: error.metaCode, subcode: error.metaSubcode, reason: error.message });
    return t.json(res, invalid ? 400 : 502, { ok: false, reason: invalid ? 'invalid_request' : 'delivery_failed' });
  }
};
