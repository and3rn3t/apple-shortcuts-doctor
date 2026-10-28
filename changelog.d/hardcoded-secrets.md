### Added

- Hardcoded secret detection (#43). A `hardcoded-secret` finding names the actions that seem to
  contain a credential, in three rules: `secret-token-format` (known shapes such as AWS, GitHub,
  Slack, Stripe, Google, Anthropic and OpenAI keys, JWTs, private-key headers, `Bearer` tokens, and
  passwords in URLs) and `secret-named-field` (a header, JSON field, or URL query named like a
  secret, such as `Authorization` or `api_key`, with a literal value that is not an ordinary word),
  both `warning`; and `secret-high-entropy` (a value that is nothing but one long random-looking
  token), a `review`. Values that come from variables are never flagged.
- The report gives the action number only: never the value, any part of it, or its length, in the
  report, errors, text, Markdown, or the web page. `--fail-on warning` now fails a Shortcut with a
  recognized hardcoded credential.
- Checked on 138 real exports: 11 with a secret-named field and 21 with a lone random token, none
  with a known token format, no failures, 0.4 s for all of them. Scanning runs inside text flagged
  40% of Shortcuts (URLs and encoded blobs), so only a whole-value token counts.
