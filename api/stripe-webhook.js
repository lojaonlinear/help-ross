const Stripe = require('stripe');
const t = require('../lib/tracking.cjs');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return t.json(res, 405, { ok: false });
  if (!process.env.STRIPE_WEBHOOK_SECRET) return t.json(res, 503, { ok: false, reason: 'not_configured' });
  let event;
  try {
    const raw = await t.rawBody(req, 1048576);
    event = Stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch { return t.json(res, 400, { ok: false, reason: 'invalid_signature' }); }
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return t.json(res, 200, { received: true, ignored: true });
  const session = event.data.object;
  const reference = t.REFERENCE.exec(session.client_reference_id || '');
  if (!reference || session.payment_status !== 'paid' || session.mode !== 'payment' || !/^cs_(?:live|test)_[A-Za-z0-9]+$/.test(session.id || '')) return t.json(res, 200, { received: true, ignored: true });
  // Never send a test payment as a live purchase.
  if (!event.livemode && !process.env.META_TEST_EVENT_CODE) return t.json(res, 200, { received: true, ignored: true });
  let blob, receiptPath, claim;
  try {
    blob = await t.blobSDK();
    receiptPath = `meta-purchases/${session.id}.json`;
    const existing = await t.readPrivate(receiptPath, blob);
    if (existing?.data.state === 'accepted') return t.json(res, 200, { received: true, duplicate: true });
    if (existing && Date.now() - existing.data.updatedAt < 120000) return t.json(res, 503, { ok: false, reason: 'retry_later' });
    const contextPath = `meta-checkouts/${reference[1]}.json`;
    const context = await t.readPrivate(contextPath, blob);
    const purchase = t.purchaseFromSession(session, event, context?.data);
    if (!purchase) return t.json(res, 200, { received: true, ignored: true });
    claim = await t.putPrivate(receiptPath, { state: 'processing', updatedAt: Date.now() }, blob,
      existing ? { ifMatch: existing.etag } : { allowOverwrite: false });
    await t.sendMeta(purchase);
    await t.putPrivate(receiptPath, { state: 'accepted', updatedAt: Date.now() }, blob, { ifMatch: claim.etag });
    await blob.del(contextPath);
    return t.json(res, 200, { received: true });
  } catch (error) {
    // Stripe retries unsuccessful deliveries; event_id stays tied to the Checkout Session.
    if (claim && receiptPath && blob) {
      try { await t.putPrivate(receiptPath, { state: 'retry', updatedAt: 0 }, blob, { ifMatch: claim.etag }); } catch {}
    }
    console.error('Purchase delivery failed', { reason: error.message, code: error.metaCode, subcode: error.metaSubcode });
    return t.json(res, 503, { ok: false, reason: 'retry_later' });
  }
};
module.exports.config = { api: { bodyParser: false } };
