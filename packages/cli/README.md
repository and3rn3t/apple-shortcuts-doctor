# shortcuts-doctor

Static inspector for Apple Shortcuts exports. It explains what a Shortcut does, which data it
could expose, and which references look broken, **without running it**. It never executes
anything, never prints parameter values, and makes no network requests.

```bash
npx shortcuts-doctor inspect /absolute/path/export.json
```

Requires Node.js 22 or newer.

Pass `-` instead of a file to read the export from stdin, for example to convert a plist first or
to inspect output from another tool:

```bash
plutil -convert json -o - export.plist | npx shortcuts-doctor inspect -
```

Stdin has the same 4 MiB limit as files. An interactive terminal on stdin is refused rather than
waited on.

## Example

```text
Shortcuts Doctor: 8 action(s), 9 finding(s)

Actions
1. getclipboard [sensitive-input]
2. gettext [basic] <- #1
3. downloadurl [outbound] <- #2
4. runshellscript [code-execution]
...

Findings
REVIEW sensitive-input (#1): Reads the clipboard, which may contain private data.
WARNING code-execution (#4): Runs shell commands; embedded code is not inspected.
...
```

Severity (`review`, `warning`) orders your manual review. An empty findings list does not mean a
Shortcut is safe.

## Options

| Option                      | Description                                                        |
| --------------------------- | ------------------------------------------------------------------ |
| `--format text\|json\|md`   | Output format. Default: `text` on a terminal, `json` when piped    |
| `--format-version 1\|2`     | JSON report version (default `2`; schema in the repository)        |
| `--fail-on review\|warning` | Exit `2` if any finding is at or above this severity               |
| `--quiet`                   | Do not print the report (errors and `--fail-on` notes still print) |
| `-v`, `--version`           | Print the version                                                  |
| `-h`, `--help`              | Show usage                                                         |

An unrecognized option exits `1` with `Unknown option: <name>`.

Exit codes: `0` ok, `1` usage or input error, `2` findings reached the `--fail-on` threshold.

## Supported inputs

JSON, XML plist, and binary plist exports, up to 4 MiB and 2000 actions, on any OS. Plists are
decoded in pure TypeScript; nothing is spawned. Signed `.shortcut` containers are
not decoded, and signatures are never bypassed.

## Use in CI

For a repository that versions Shortcut exports. Pin the version so results stay stable:

```yaml
jobs:
  inspect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      - run: npx shortcuts-doctor@0.2 inspect --fail-on warning --quiet shortcuts/my-shortcut.json
```

## More

- [Project README](https://github.com/and3rn3t/apple-shortcuts-doctor#readme)
- [Report a bug or request a feature](https://github.com/and3rn3t/apple-shortcuts-doctor/issues)
- [Security policy](https://github.com/and3rn3t/apple-shortcuts-doctor/security/policy)
