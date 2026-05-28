#!/usr/bin/env bash
# Auto-packages the Chrome extension zip whenever manifest.json version changes.
# The zip is staged automatically so it's included in the same commit.

set -euo pipefail

MANIFEST="chrome-extension/manifest.json"

# Only run if manifest.json is staged
if ! git diff --cached --name-only | grep -q "^${MANIFEST}$"; then
  exit 0
fi

# Read version from the staged version of the file
VERSION=$(git show ":${MANIFEST}" | grep '"version"' | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

if [ -z "$VERSION" ]; then
  echo "pre-commit: could not read version from ${MANIFEST}, skipping zip"
  exit 0
fi

ZIP="chrome-extension-v${VERSION}.zip"

echo "pre-commit: packaging extension v${VERSION} → ${ZIP}"

# Build zip from the working tree (includes any staged changes written to disk)
zip -qr "${ZIP}" chrome-extension/ --exclude "*.DS_Store" --exclude "*/.DS_Store"

# Stage the new zip
git add "${ZIP}"

echo "pre-commit: ${ZIP} added to commit"
