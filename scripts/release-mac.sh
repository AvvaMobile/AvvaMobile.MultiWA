#!/usr/bin/env bash
# Builds, signs (Developer ID from the login keychain) and notarizes the macOS app on this Mac, then uploads it to
# the GitHub release of package.json's version (docs/RELEASING.md). No CI is involved.
# Needs APPLE_API_KEY (path to the .p8), APPLE_API_KEY_ID and APPLE_API_ISSUER.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${APPLE_API_KEY:?path to AuthKey_XXXX.p8}" "${APPLE_API_KEY_ID:?}" "${APPLE_API_ISSUER:?}"
version="v$(node -p "require('./package.json').version")"
gh release view "$version" >/dev/null 2>&1 || gh release create "$version" --draft --title "MultiWA $version" --notes "See CHANGELOG in the release description."

rm -rf dist
npx electron-vite build
npx electron-builder --mac --publish never

shopt -s nullglob
files=(dist/*.dmg dist/*.dmg.blockmap dist/*-mac.zip dist/*-mac.zip.blockmap dist/latest-mac.yml)
gh release upload "$version" "${files[@]}" --clobber
echo "Uploaded ${#files[@]} files to $version (draft). Publish it from the GitHub Releases page when the Windows build is attached."
