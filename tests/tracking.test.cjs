const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const Stripe = require('stripe');
const tracking = require('../lib/tracking.cjs');
const endpoint = require('../api/meta-events.js');
const webhook = require('../api/stripe-webhook.js');
const id = '37016b98-e4a2-4fd2-95d5-9cba968e9694';
const req = () => ({ headers: { origin: 'https://help-ross.vercel.app', 'user-agent': 'Integration test browser', 'x-forwarded-for': '203.0.113.10', 'content-type': 'application/json' } });
const client = () => ({ consent: true, event_name: 'PageView', event_id: id, event_source_url: 'https://help-ross.vercel.app/?email=never-send@example.test&slug=medical-story', visitor_id: id });
const context = () => ({ value: 50, consent: true, currency: 'USD', source: 'https://help-ross.vercel.app/', createdAt: Date.now(), user_data: { client_user_agent: 'Original browser', fbp: 'fb.1.1790000000000.1234567890' } });
const session = () => ({ id: 'cs_live_unitTest123', mode: 'payment', payment_status: 'paid', amount_total: 5000, currency: 'usd', payment_link: 'plink_unitTest', client_reference_id: 'lm1_' + id.replaceAll('-', '') });
function response() { return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(value) { this.body = value ? JSON.parse(value) : null; } }; }
function blobMemory() {
  const records = new Map(); let revision = 0;
  return { records,
    async get(path) { const record = records.get(path); return record ? { statusCode: 200, stream: new Response(JSON.stringify(record.data)).body, blob: { etag: record.etag } } : null; },
    async put(path, text, options) {
      assert.equal(options.access, 'private'); assert.equal(options.ttlDays, 30);
      const prior = records.get(path);
      if (options.ifMatch && prior?.etag !== options.ifMatch) throw new Error('Precondition failed');
      if (options.allowOverwrite === false && prior) throw new Error('Already exists');
      const record = { data: JSON.parse(text), etag: String(++revision) }; records.set(path, record); return { etag: record.etag };
    }, async del(path) { records.delete(path); }
  };
}
function signedRequest(event, secret = 'whsec_unit_test', timestamp = Math.floor(Date.now() / 1000)) {
  const payload = JSON.stringify(event);
  const input = Readable.from([Buffer.from(payload)]); input.method = 'POST';
  input.headers = { 'stripe-signature': Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp }) };
  return input;
}
test.before(() => { process.env.META_PIXEL_ID = '1259106795284776'; process.env.META_CAPI_ACCESS_TOKEN = 'unit-test-not-a-real-token'; process.env.STRIPE_ALLOWED_PAYMENT_LINK_IDS = 'plink_unitTest'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit_test'; });
test.afterEach(() => test.mock.restoreAll());
test('consent is required and Purchase cannot be posted by a browser', () => {
  assert.throws(() => tracking.validateEvent(req(), { ...client(), consent: false }));
  assert.throws(() => tracking.validateEvent(req(), { ...client(), event_name: 'Purchase' }));
  const input = req(); input.headers['sec-gpc'] = '1'; assert.throws(() => tracking.validateEvent(input, client()));
});
test('only approved event data is forwarded; source query and medical content are removed', () => {
  const event = tracking.validateEvent(req(), { ...client(), email: 'do-not-forward@example.test', content_name: 'medical story', user_data: { client_ip_address: '1.1.1.1' } });
  assert.equal(event.event_source_url, 'https://help-ross.vercel.app/');
  assert.equal(event.user_data.client_ip_address, '203.0.113.10');
  assert.equal(event.user_data.external_id[0].length, 64);
  assert.ok(!JSON.stringify(event).includes('medical')); assert.ok(!JSON.stringify(event).includes('@'));
});
test('all six checkout tiers are accepted, other amounts are rejected', () => {
  for (const value of [25, 50, 100, 150, 200, 500]) assert.equal(tracking.validateEvent(req(), { ...client(), event_name: 'InitiateCheckout', value }).custom_data.value, value);
  for (const value of [-1, 0, 1, 49, 501, '50']) assert.throws(() => tracking.validateEvent(req(), { ...client(), event_name: 'InitiateCheckout', value }));
});
test('unapproved origins, arbitrary paths and missing user agents are rejected', () => {
  for (const source of ['https://other.test/', 'https://help-ross.vercel.app/private-record', 'https://lojaonlinear.github.io/other-project/']) assert.throws(() => tracking.sourceURL(source, new URL(source).origin));
  const input = req(); delete input.headers['user-agent']; assert.throws(() => tracking.validateEvent(input, client()));
});
test('Meta request uses the same event ID and current version; token only appears in authorization', async () => {
  let options, url; const event = tracking.validateEvent(req(), client());
  await tracking.sendMeta(event, async (u, o) => { url = u; options = o; return { ok: true, json: async () => ({ events_received: 1 }) }; });
  assert.match(url, /v27\.0\/1259106795284776\/events$/);
  assert.equal(JSON.parse(options.body).data[0].event_id, id);
  assert.ok(!options.body.includes(process.env.META_CAPI_ACCESS_TOKEN));
});
test('public configuration never exposes the Meta token', async () => {
  const res = response(); await endpoint({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.pixelId, process.env.META_PIXEL_ID);
  assert.ok(!JSON.stringify(res.body).includes(process.env.META_CAPI_ACCESS_TOKEN));
});
test('cross-origin requests and browser Purchase attempts do not reach Meta', async () => {
  const res = response(); await endpoint({ method: 'POST', headers: { origin: 'https://other.test' } }, res); assert.equal(res.statusCode, 403);
  const input = req(); input.method = 'POST'; input.body = { ...client(), event_name: 'Purchase' };
  const bad = response(); await endpoint(input, bad); assert.equal(bad.statusCode, 400);
});
test('checkout context is private, expires automatically and returns only an opaque reference', async () => {
  const blob = blobMemory(); const reference = await tracking.createContext(req(), { ...client(), value: 50 }, blob);
  assert.match(reference, /^lm1_[a-f0-9]{32}$/); assert.equal(blob.records.size, 1);
  const saved = [...blob.records.values()][0].data; assert.equal(saved.user_data.client_user_agent, 'Integration test browser');
});
test('pending, unrelated, unconsented and expired purchases are not tracked', () => {
  const event = { created: Math.floor(Date.now() / 1000) };
  assert.equal(tracking.purchaseFromSession({ ...session(), payment_status: 'unpaid' }, event, context()), null);
  assert.equal(tracking.purchaseFromSession(session(), event, { ...context(), consent: false }), null);
  assert.equal(tracking.purchaseFromSession(session(), event, { ...context(), createdAt: Date.now() - 31 * 86400000 }), null);
  assert.equal(tracking.purchaseFromSession({ ...session(), payment_link: 'plink_otherBusiness' }, event, context()), null);
  assert.throws(() => tracking.purchaseFromSession({ ...session(), amount_total: 100 }, event, context()));
});
test('paid Purchase uses Stripe amount and stable session ID, plus the original browser context', () => {
  const event = { created: 1790000000 }; const result = tracking.purchaseFromSession(session(), event, context());
  assert.equal(result.event_id, 'stripe_cs_live_unitTest123'); assert.equal(result.custom_data.value, 50); assert.equal(result.event_time, event.created);
  assert.equal(result.user_data.client_user_agent, 'Original browser');
});
test('invalid or expired webhook signatures are rejected', async () => {
  const event = { type: 'checkout.session.completed', data: { object: session() } };
  for (const input of [signedRequest(event, 'whsec_wrong'), signedRequest(event, 'whsec_unit_test', 1)]) {
    const res = response(); await webhook(input, res); assert.equal(res.statusCode, 400);
  }
});
test('confirmed webhook is delivered once, duplicates are acknowledged and context is removed', async () => {
  const blob = blobMemory(); let deliveries = 0;
  test.mock.method(tracking, 'blobSDK', async () => blob);
  test.mock.method(tracking, 'sendMeta', async () => { deliveries++; return { received: 1 }; });
  await tracking.putPrivate(`meta-checkouts/${id.replaceAll('-', '')}.json`, context(), blob);
  const event = { id: 'evt_unitTest', created: Math.floor(Date.now() / 1000), livemode: true, type: 'checkout.session.completed', data: { object: session() } };
  const first = response(); await webhook(signedRequest(event), first); assert.equal(first.statusCode, 200);
  const duplicate = response(); await webhook(signedRequest(event), duplicate); assert.equal(duplicate.body.duplicate, true); assert.equal(deliveries, 1);
  assert.equal(blob.records.has(`meta-checkouts/${id.replaceAll('-', '')}.json`), false);
});
test('failed Meta delivery causes Stripe retry instead of a false success', async () => {
  const blob = blobMemory(); test.mock.method(tracking, 'blobSDK', async () => blob);
  test.mock.method(tracking, 'sendMeta', async () => { throw new Error('upstream_timeout'); });
  test.mock.method(console, 'error', () => {});
  await tracking.putPrivate(`meta-checkouts/${id.replaceAll('-', '')}.json`, context(), blob);
  const event = { created: Math.floor(Date.now() / 1000), livemode: true, type: 'checkout.session.completed', data: { object: session() } };
  const res = response(); await webhook(signedRequest(event), res); assert.equal(res.statusCode, 503);
  assert.equal(blob.records.get('meta-purchases/cs_live_unitTest123.json').data.state, 'retry');
});
test('test payments cannot create live Purchase events', async () => {
  const event = { created: Math.floor(Date.now() / 1000), livemode: false, type: 'checkout.session.completed', data: { object: session() } };
  const res = response(); await webhook(signedRequest(event), res); assert.equal(res.statusCode, 200); assert.equal(res.body.ignored, true);
});
test('the offline campaign adapter delegates the live conversion endpoint to native fetch', async () => {
  const vm = require('node:vm'); const fs = require('node:fs'); const path = require('node:path');
  let calls = 0;
  const window = { location: { href: 'https://help-ross.vercel.app/' }, fetch: async () => { calls++; return new Response('{"ok":true}'); } };
  const source = fs.readFileSync(path.join(__dirname, '../offline-data_v=f7c3adaa0867.js'), 'utf8');
  vm.runInNewContext(source, { window, URL, Response, document: { addEventListener() {} } });
  const result = await window.fetch('https://help-ross.vercel.app/api/meta-events', { method: 'POST' });
  assert.equal((await result.json()).ok, true); assert.equal(calls, 1);
});
