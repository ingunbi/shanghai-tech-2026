# Shanghai travel site editing

This private repository is the source of truth for the public travel site:
https://shanghai-tech-2026.chris-ingunbi.chatgpt.site

## Changes and publication

- Read `README.md` before editing. Work from the latest `main`; reconcile other people's changes without resets or force pushes.
- Edit the buildless static site in `dist/`. Do not introduce a build system for routine itinerary or visual changes.
- Keep the concise responsive layout and short travel routes. Preserve unrelated dates and core activities unless the user requests changes.
- When changing itinerary data, keep `days`, `journeyMap.days`, map place IDs and `videoGuide.places` inclusion dates/order consistent. State partial visits precisely.
- Verify current venue details with official sources and retain useful source links. Do not treat old video prices/hours as current.
- Run `node scripts/validate-public-site.mjs` and `node scripts/publish-site.mjs --dry-run`, then inspect the affected screen.
- A branch/PR does not publish. A relevant push or merge to `main` starts **Publish Shanghai site**. Use a PR when review is requested; publish `main` only within the user's authorization.
- Confirm the Actions result and affected public screen. Do not claim successful deployment solely from a commit or push.

## Privacy and deployment boundaries

- The repository stays private. Only reviewed `dist/` assets are published.
- Exclude personal booking references, passport details, personal contacts, private email/reservation originals and credentials. Public business contacts and source links may be retained.
- Never print, commit or transmit deployment secrets in file content, URLs, command arguments or logs. Live publication uses the GitHub Actions secret `SHANGHAI_DEPLOY_TOKEN` in an HTTP header.
- Do not run or reinstall `scripts/sync-site.py`; the former Sites-to-GitHub direction is disabled. Do not copy any Sites Git history, Worker/server source, local marker lists or deployment credentials here.
- Do not edit publishing workflow or server credentials as a workaround for a failed content check. Fix the underlying public-file issue.

## Local preview

Run `python3 -m http.server 4173 --bind 127.0.0.1 --directory dist` and open http://127.0.0.1:4173.
