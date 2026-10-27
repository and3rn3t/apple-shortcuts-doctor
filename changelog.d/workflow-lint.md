### Security

- CI lints every workflow with actionlint and zizmor. Fixing their findings: checkouts no longer
  leave the GitHub token in `.git/config`, the release workflow grants `contents: write` only to
  the job that creates the GitHub Release, and release builds never restore a dependency cache, so
  a cache written by a pull request can't reach a published package.
