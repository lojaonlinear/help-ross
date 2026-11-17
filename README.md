# Help Ross — Lumani Impact

Static campaign page prepared from the supplied ZIP, hosted on GitHub Pages.

## Donations

Every Donate button opens an accessible, responsive dialog with a campaign preview and the six USD amounts supplied by the owner: 25, 50, 100, 150, 200 and 500. Selecting an amount enables the yellow continue link with its exact Stripe URL. Stripe controls the final checkout amount, currency and recipient. No payment is processed or recorded by this static site.

The fallback `donate.html` route opens the same dialog. Closing it returns to the campaign.

## Data and media

The 53 campaign records and 144 media references are stored locally. Campaign totals and donor counts remain snapshots; they do not update from Stripe. Generated donor names, donations, comments, avatars and reaction lists have been removed. Only support messages actually present in the supplied data are displayed. Reactions are a local UI interaction, not a server-backed count.

The contact action explains that no messaging backend is configured and links to the original campaign. Institutional links open the original website because those pages were absent from the ZIP.

## Hosting and checks

GitHub Pages can serve the repository root (`main`, `/`). Vercel runs `npm run build`, serves `public/` and builds the Node.js functions in `api/`. Dependencies and server source are excluded from the public build. Content hashes in script and stylesheet URLs prevent stale assets after updates.

JavaScript syntax, local asset references, image integrity, amount-to-Stripe mappings, responsive layouts, navigation, search, carousel, dialogs and keyboard controls were checked. The 21st deterministic review reports zero errors and zero warnings; remaining suggestions concern the existing site's hardcoded styling.

## Meta measurement

The confirmed Pixel ID is `1259106795284776`. `tracking.js` loads Meta Pixel only after advertising consent, respects GPC/DNT, disables automatic page/button metadata collection, and sends manual PageView, ViewContent and InitiateCheckout events. Browser and server share an event ID for deduplication. No patient story, campaign title, donor name, card field or email is included in configured event payloads.

The server uses Graph API v27.0. Set `META_PIXEL_ID` and secret `META_CAPI_ACCESS_TOKEN` in Vercel; never put the access token in client code. The live CAPI endpoint explicitly bypasses the offline campaign adapter.

After consent, checkout receives an opaque client reference. Attribution context is kept in a private Vercel Blob store, expires automatically after 30 days and is deleted after delivery. The Stripe endpoint validates the raw-body signature with the official Stripe SDK, verifies payment status, USD amount and an allowlist of the six payment-link IDs. A private receipt and conditional writes prevent repeated processing. Only confirmed paid Stripe sessions can produce Purchase; a browser request or checkout click cannot.

Production also requires secret `STRIPE_WEBHOOK_SECRET`, `STRIPE_ALLOWED_PAYMENT_LINK_IDS` and the Blob connection. Subscribe only to `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Test payments are ignored unless a Meta test-event code is configured. Stripe retries unsuccessful webhook deliveries. Do not send fake purchases to validate a live pixel.

Run `npm test` for consent, input validation, event identity, data minimization, signature verification, payment filtering, duplicate handling, retries and live-endpoint delegation tests. A confirmed Meta API response is required before calling CAPI operational; an installed browser tag alone does not prove server permission for the selected pixel.
