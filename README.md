# Help Ross — Lumani Impact

Static campaign page prepared from the supplied ZIP, hosted on GitHub Pages.

## Donations

Every Donate button opens an accessible, responsive dialog with a campaign preview and the six USD amounts supplied by the owner: 25, 50, 100, 150, 200 and 500. Selecting an amount enables the yellow continue link with its exact Stripe URL. Stripe controls the final checkout amount, currency and recipient. No payment is processed or recorded by this static site.

The fallback `donate.html` route opens the same dialog. Closing it returns to the campaign.

## Data and media

The 53 campaign records and 144 media references are stored locally. Campaign totals and donor counts remain snapshots; they do not update from Stripe. Generated donor names, donations, comments, avatars and reaction lists have been removed. Only support messages actually present in the supplied data are displayed. Reactions are a local UI interaction, not a server-backed count.

The contact action explains that no messaging backend is configured and links to the original campaign. Institutional links open the original website because those pages were absent from the ZIP.

## Hosting and checks

Serve the repository root with GitHub Pages (`main`, `/`). No dependencies or build step. `.nojekyll` is included. Content hashes in script and stylesheet URLs prevent stale assets after updates.

JavaScript syntax, local asset references, image integrity, amount-to-Stripe mappings, responsive layouts, navigation, search, carousel, dialogs and keyboard controls were checked. The 21st deterministic review reports zero errors and zero warnings; remaining suggestions concern the existing site's hardcoded styling.
