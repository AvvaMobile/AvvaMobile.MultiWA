# Releasing MultiWA

Everything is built and uploaded from a developer machine. There is no CI; never add a workflow that builds or publishes.

## Prerequisites

- macOS release machine with the Avva Mobile Developer ID Application certificate in the login keychain.
- App Store Connect API key (`AuthKey_<KEY_ID>.p8`), its Key ID and Issuer ID (for notarization).
- `gh` CLI signed in to an account with write access to `AvvaMobile/AvvaMobile.MultiWA`.
- A Windows machine (or macOS with Rosetta for `makensis`) for the Windows installer.

## Steps

1. Bump `version` in `package.json`, commit (`chore: release X.Y.Z`). Do **not** push a tag yet.
2. macOS: `APPLE_API_KEY=~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8 APPLE_API_KEY_ID=<KEY_ID> APPLE_API_ISSUER=<ISSUER_ID> npm run release:mac`
   — builds arm64 + x64 DMG/zip, signs, notarizes, creates the draft release `vX.Y.Z` if needed and uploads the files with `latest-mac.yml`.
3. Windows: `npm run dist:win`, then `gh release upload vX.Y.Z dist/MultiWA-Setup-X.Y.Z.exe dist/MultiWA-Setup-X.Y.Z.exe.blockmap dist/latest.yml --clobber`.
4. Write release notes in the draft, then publish it on GitHub. Installed apps pick the update up within 4 hours (or via Help → Check for Updates…).
5. Push the commit. GitHub creates the tag `vX.Y.Z` when the draft is published; run `git fetch --tags` afterwards. Never create or push the tag yourself (it would collide with GitHub's).

## Local builds

- `npm run dist:mac` → `dist/` (signed only if a Developer ID is in the keychain; `CSC_IDENTITY_AUTO_DISCOVERY=false` forces unsigned).
- `npm run dist:win` → needs Windows or Rosetta.
- Builds never publish by themselves.

## Windows notes

Unsigned: SmartScreen shows "unknown publisher" → More info → Run anyway. Installs per user into `%LOCALAPPDATA%\Programs`.
