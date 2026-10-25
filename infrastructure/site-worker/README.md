# Existing Site publishing service

This directory backs up the reviewed server source for the existing Shanghai chatgpt.site. It is not part of the public dist/ and contains no runtime credentials.

Normal content and design changes belong in the repository root dist/. GitHub Actions publishes those files automatically; no server rebuild is needed.

Infrastructure is maintained in the native Sites checkout. It uses Worker ESM, a BUCKET R2 binding and a secret DEPLOY_TOKEN. The repository Actions secret SHANGHAI_DEPLOY_TOKEN holds the matching value. Keep both out of source and logs.

The native checkout builds these modules together with a reviewed bootstrap public/ snapshot and its existing .openai/hosting.json. Run node scripts/build.mjs and node --test tests/*.test.mjs there, then use the native Sites publishing workflow while preserving the same project and public audience. public/ and generated fallback.generated.mjs are intentionally not duplicated in this backup.

Each successful main publication creates an immutable R2 snapshot and only then updates active.json. Frontend URLs stay on the existing host; versioned asset paths keep a page's scripts, styles and images consistent. Failed upload/checks leave the previous active snapshot untouched. Reverting a frontend commit and pushing main publishes the reverted content as a new release.
