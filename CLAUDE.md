# Shanghai travel website

Read and follow `AGENTS.md` and `README.md` in this repository.

This private GitHub repository is the editing source for the existing public site. Modify the static files under `dist/`; the trip is in `dist/data-public.js`. Preserve the concise layout, short travel routes, and consistent itinerary/map/video dates.

Run `node scripts/validate-public-site.mjs` and `node scripts/publish-site.mjs --dry-run`, and check the changed screen. A relevant push or merge to `main` automatically publishes to the same `chatgpt.site` address through **Publish Shanghai site**. Check the workflow result before claiming it is live. Use a branch/PR if review is requested.

Do not run the retired `scripts/sync-site.py`, create another site/repository, copy the Sites Git history, or expose booking references, personal information or credentials. Deployment secrets stay in GitHub Actions and Sites secret storage.
