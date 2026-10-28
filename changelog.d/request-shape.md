### Added

- Request shape for Get Contents of URL (#42). Each such action has a `request` with
  `url` (`literal`, `dynamic`, or `missing`), `method` (`default`, `get`, `post`, `put`, `patch`,
  `delete`, `dynamic`, or `other`), `body` (`none`, `json`, `form`, `file`, or `unknown`), and the
  number of `headers`. Text and Markdown show it as `{POST, json body, 2 headers, dynamic URL}`, and
  the web report as "request: ...". Shape only: no URL, header name or value, body, or unknown
  method text is read into the report.
- `--show-hosts` (CLI) or `includeHosts` (API) adds `host`: the hostname of a literal URL, and only
  when the text before the first variable already ends it. Credentials, ports, paths, and queries are
  never read, and a host that comes from a variable is left out. Off by default.
- Checked on 138 real exports: no failures.
