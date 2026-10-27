### Added

- The release workflow can deploy the web app to Cloudflare Workers and verify the live site
  (`deploy-web`, opt-in via `DEPLOY_WEB`). `scripts/verify-deployed.mjs` requires every built file
  to be served byte-for-byte with its `_headers` headers. CI validates the deploy configuration
  with `wrangler deploy --dry-run`. Setup steps are in CONTRIBUTING.
