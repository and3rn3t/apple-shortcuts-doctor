#!/usr/bin/env bash
# Packs the CLI exactly as npm publishes it, installs the tarball into a clean directory, and
# checks the installed bin. Usage: scripts/smoke-pack.sh   (CI: .github/workflows/ci.yml)
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

fail() {
  echo "smoke-pack: $*" >&2
  exit 1
}

# 1. Pack (prepack builds dist/) and check the tarball contents.
pnpm --dir "$repo" --filter shortcuts-doctor pack --pack-destination "$work" >/dev/null
tarball="$(ls "$work"/shortcuts-doctor-*.tgz)"
expected=$'package/LICENSE\npackage/README.md\npackage/dist/shortcuts-doctor.mjs\npackage/package.json'
actual="$(tar -tzf "$tarball" | sort)"
[ "$actual" = "$expected" ] || fail "unexpected tarball contents:"$'\n'"$actual"
tar -tvzf "$tarball" package/dist/shortcuts-doctor.mjs | grep -q '^-rwx' ||
  fail 'bin is not executable in the tarball'
tar -xOzf "$tarball" package/dist/shortcuts-doctor.mjs | head -n 1 | grep -qx '#!/usr/bin/env node' ||
  fail 'bin is missing its shebang'

# 2. Install into an empty project, as a user would, with no workspace around it.
mkdir "$work/consumer"
(cd "$work/consumer" && npm init -y >/dev/null && npm install --no-audit --no-fund "$tarball" >/dev/null)
bin="$work/consumer/node_modules/.bin/shortcuts-doctor"
[ -x "$bin" ] || fail 'npm did not link the shortcuts-doctor bin'

# 3. Run it: --version, a report from each fixture format (exit 0), the --fail-on threshold
# (exit 2), and a usage error (exit 1).
expected_version="$(node -p "require('$repo/packages/cli/package.json').version")"
[ "$("$bin" --version)" = "$expected_version" ] || fail "--version did not print $expected_version"
for name in mixed-actions.json mixed-actions.plist mixed-actions.binary.plist; do
  "$bin" inspect --format text "$repo/tests/fixtures/$name" | grep -q '^Shortcuts Doctor: 8 action(s)' ||
    fail "inspect did not print the expected summary for $name"
done
fixture="$repo/tests/fixtures/mixed-actions.json"
status=0
"$bin" inspect --quiet --fail-on warning "$fixture" 2>/dev/null || status=$?
[ "$status" -eq 2 ] || fail "--fail-on warning exited $status, expected 2"
status=0
"$bin" >/dev/null 2>&1 || status=$?
[ "$status" -eq 1 ] || fail "missing file argument exited $status, expected 1"

echo "smoke-pack: ok ($(basename "$tarball"), node $(node --version))"
