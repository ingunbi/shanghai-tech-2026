# Shanghai travel site editing

This public repository is the source of truth for the travel site, served by GitHub Pages:
https://ingunbi.github.io/shanghai-tech-2026/ (reachable from mainland China)

## Changes and publication

- Read `README.md` before editing. Work from the latest `main`; reconcile other people's changes without resets or force pushes.
- Edit the buildless static site in `dist/`. Do not introduce a build system for routine itinerary or visual changes.
- Keep the concise responsive layout and short travel routes. Preserve unrelated dates and core activities unless the user requests changes.
- When changing itinerary data, keep `days`, `journeyMap.days`, map place IDs and `videoGuide.places` inclusion dates/order consistent. State partial visits precisely.
- Verify current venue details with official sources and retain useful source links. Do not treat old video prices/hours as current.
- Run `node scripts/validate-public-site.mjs`, then inspect the affected screen.
- A branch/PR does not publish. A relevant push or merge to `main` starts **Publish Shanghai site** (`.github/workflows/pages.yml`). Use a PR when review is requested; publish `main` only within the user's authorization.
- Confirm the Actions result and affected public screen. Do not claim successful deployment solely from a commit or push.

## Privacy boundaries

- The repository and its history are public. Everything committed is visible.
- Exclude personal booking references, passport details, personal contacts (including the travellers' own phone numbers), private email/reservation originals and credentials. Public business contacts and source links may be retained.
- Do not edit the publishing workflow as a workaround for a failed content check. Fix the underlying public-file issue.
- Do not create mirror repositories or other hosting copies; this repository's Pages site is the only address.

## Local preview

Run `python3 -m http.server 4173 --bind 127.0.0.1 --directory dist` and open http://127.0.0.1:4173.
