### Added

- The release workflow verifies what it published: it waits for npm to serve the new version,
  installs it into an empty project, and checks `--version`, every fixture format, and the SLSA
  provenance attestation (`scripts/verify-published.sh`).
