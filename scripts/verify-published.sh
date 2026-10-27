#!/usr/bin/env bash
# Verifies a published version from the npm registry, the way a user gets it: waits until the
# registry serves it, installs it into an empty project, checks --version and provenance, and
# inspects every fixture format.
# Usage: scripts/verify-published.sh <version> [timeout-seconds]   (CI: .github/workflows/release.yml)
set -euo pipefail

version="${1:?usage: scripts/verify-published.sh <version> [timeout-seconds]}"
timeout="${2:-600}"
package="shortcuts-doctor"
repo="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

fail() {
  echo "verify-published: $*" >&2
  exit 1
}

# 1. The registry can take minutes to serve a new version; poll its version document directly.
deadline=$((SECONDS + timeout))
until curl -fs -o /dev/null -H 'Cache-Control: no-cache' "https://registry.npmjs.org/${package}/${version}"; do
  [ "$SECONDS" -lt "$deadline" ] || fail "${package}@${version} was not on the registry after ${timeout}s"
  sleep 15
done

# 2. Provenance must be attached; trusted publishing is what makes the release verifiable.
provenance="$(npm view "${package}@${version}" dist.attestations.provenance.predicateType --prefer-online)"
[ "$provenance" = "https://slsa.dev/provenance/v1" ] || fail "${package}@${version} has no SLSA provenance"

# 3. Install from the registry into an empty project and run the bin.
(cd "$work" && npm init -y >/dev/null && npm install --no-audit --no-fund --prefer-online "${package}@${version}" >/dev/null)
bin="$work/node_modules/.bin/shortcuts-doctor"
[ "$("$bin" --version)" = "$version" ] || fail "installed bin does not report ${version}"
for name in mixed-actions.json mixed-actions.plist mixed-actions.binary.plist; do
  "$bin" inspect --format text "$repo/tests/fixtures/$name" | grep -q '^Shortcuts Doctor: 8 action(s)' ||
    fail "installed bin did not inspect $name"
done

echo "verify-published: ok (${package}@${version}, provenance attached, node $(node --version))"
