# MultiWA — Design

Date: 2026-10-11. Status: approved design, pre-implementation.

MultiWA is a macOS/Windows Electron desktop app that runs several WhatsApp Web accounts side by side on one computer, one account per tab. It reuses the shell experience of Avva Mobile Sidekick (`AvvaMobile.Sidekick`): the same tab bar, multi-window tabs, split pane, notifications, persistence, security posture and packaging. It contains nothing of Sidekick's ChatGPT/Claude integration.

Reference project: `../AvvaMobile.Sidekick` (modules named below are ported from there). `ChatGPT.Tabbed` is **not** a source; only its idea of per-tab session partitions is used.

## 1. Product boundaries

MultiWA will:

- embed `https://web.whatsapp.com` as remote, isolated content, once per account, each with its own persistent session partition;
- keep every open account alive at once and switch between them without reloading;
- show unread counts per tab and in total (Dock / taskbar), and route WhatsApp's own OS notifications back to the right tab;
- let the user move tabs between windows and show two accounts side by side in one window;
- download media to `~/Downloads`; allow microphone, camera, notifications and clipboard for WhatsApp only.

MultiWA will not: reimplement any WhatsApp feature, read or store message content or credentials, give remote content any bridge to Node/Electron, scrape WhatsApp's DOM (the only page signal used is the window title), or use CI for builds and releases.

UI language: English. Product name: **MultiWA**. App id: `com.avvamobile.multiwa`. Repository: `AvvaMobile/MultiWA` (public).

## 2. Concepts

- **Account** (Sidekick's *Workspace*): `id` (uuid), `name` (user-editable, default `Account N`), `color` (auto-assigned from a fixed palette), `partition = persist:wa-<id>`, tab order, `windowId`.
- **Window**: a shell `BrowserWindow` with its own tab strip, active account, split ratio and optional right-pane account. The main window always exists while the app runs.
- **Runtime**: the `WebContentsView` and navigation/unread state of one Account. Created at startup for every Account, destroyed only on account removal or quit.

## 3. Shell composition (ported from Sidekick)

### 3.1 Tab bar — `src/renderer/shell/components/TabBar.tsx`

Identical behaviour to Sidekick's tab bar (D038): one tab per Account, browser-style, drag to reorder, double-click to rename, right-click context menu. The badge shows the unread count (§6) and the tab state (§7). The tab's color dot is the Account color.

`+` creates a new Account immediately (no start page): a new partition, a new tab, `web.whatsapp.com` loads and shows the QR code. Renaming is done on the tab.

**Closing a tab removes the account.** Because there is no start page, there is no "saved but closed" account. Close asks for confirmation ("This account's session will be removed from this computer"); on confirmation the runtime is destroyed, `session.clearStorageData()` runs and the partition directory under `<userData>/Partitions/wa-<id>` is deleted. Cancel leaves everything unchanged.

Context menu: Rename, Show in right pane / Hide right pane, Move to New Window / Move to Main Window, Reload, Remove account.

### 3.2 Multiple windows — `src/main/app/shellWindows.ts`, `ShellApp.ts`

Ported as-is. Each open tab lives in exactly one window; each window has its own active tab and split layout. Moving a tab re-parents the existing `WebContentsView`; nothing is recreated or reloaded. Closing a secondary window moves its tabs back to the main window. Closing the main window on macOS hides it (standard Dock behaviour); on Windows it quits.

### 3.3 Split pane — `src/domain/layout/splitPane.ts`, `src/main/workspace/SplitLayoutController.ts`

Sidekick's draggable divider. Left pane = the window's active tab. Right pane = empty, or one other Account chosen via the tab context menu *Show in right pane*; a small header above the right pane shows the Account name and a ✕. `⌘\` / `Ctrl+\` toggles the right pane (re-opens the last right-pane account). The ratio is persisted per window. One Account is visible in exactly one place at a time: selecting the right-pane account as the active tab swaps the panes' contents; moving it to another window closes the right pane.

### 3.4 Runtime rule (Sidekick §18)

Switching tabs, toggling split and moving between windows only call `setBounds`/`setVisible` and re-parent views. Views are never navigated, reloaded or destroyed by layout changes. Startup restores all Accounts and creates their views so switching is instant.

## 4. WhatsApp view — `src/main/accounts/AccountView.ts`

- `new WebContentsView({ webPreferences: { session: session.fromPartition('persist:wa-<id>'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } })`. **No preload, no bridge.**
- The partition's user agent has the `Electron/x` and `MultiWA/x` tokens stripped (Sidekick `userAgent` handling) so WhatsApp Web sees a normal Chromium.
- `webContents.focus()` whenever the view becomes the active pane of the focused window, so WhatsApp's keyboard shortcuts work.
- Zoom: `⌘+` / `⌘-` / `⌘0` apply to the focused view only; the level is not persisted in v1.

## 5. Security — `src/main/security/`

Ported from Sidekick (`origins.ts`, `permissions.ts`, `remoteContent.ts`) with WhatsApp values.

**Navigation** (`origins.ts`, unit-tested): top-level navigation of an account view is allowed only to `https://web.whatsapp.com`, `https://*.whatsapp.com`, `https://*.whatsapp.net`. Everything else is blocked in `will-navigate` / `will-redirect` and, if the URL scheme is `http:` or `https:`, opened with `shell.openExternal`. `setWindowOpenHandler` denies every new window and applies the same external-open rule. Downloads are *not* refused (§8).

**Permissions** (`permissions.ts`, unit-tested): the permission request and check handlers of every `persist:wa-*` session grant only to the **main frame** of origin `https://web.whatsapp.com` and only: `media` (audio and video), `notifications`, `clipboard-read`, `clipboard-sanitized-write`, `fullscreen`. All other permissions (geolocation, USB/HID/serial/Bluetooth, screen capture, midi, …) and all other origins are denied. The default session (shell renderer) gets no permissions.

`Info.plist` (`electron-builder.yml` → `mac.extendInfo`): `NSMicrophoneUsageDescription`, `NSCameraUsageDescription`.

**Shell renderer**: packaged code, `contextIsolation: true`, `sandbox: true`, typed `contextBridge` only (§9).

**Fuses / asar**: Sidekick's `electronFuses` block unchanged (`runAsNode: false`, `enableNodeOptionsEnvironmentVariable: false`, `enableNodeCliInspectArguments: false`, `enableEmbeddedAsarIntegrityValidation: true`, `onlyLoadAppFromAsar: true`, `grantFileProtocolExtraPrivileges: true`, `resetAdHocDarwinSignature: true`). No `asarUnpack` (no native modules).

**Isolation test** (`src/__tests__/isolationBoundaries.test.ts`): `src/main/security/**` and `src/main/accounts/**` must not import renderer code; `src/renderer/**` must not import `src/main/**`; `src/domain/**` imports nothing from Electron.

## 6. Unread counts — `src/domain/unread/parseTitle.ts`, `AccountView.ts`

`page-title-updated` on each account view → `parseUnreadFromTitle(title)`: matches `^\((\d+)\)` at the start of the title and returns the number, else `0`. No DOM access.

- Tab badge: the count (hidden when 0).
- Total: sum over all Accounts → `app.setBadgeCount` (macOS Dock) / `win.setOverlayIcon` with a count image (Windows). Recomputed on every change.
- If WhatsApp changes its title format, badges simply show nothing; nothing else breaks.

## 7. Account states

Per runtime: `loading` → `ready`; `offline` on `did-fail-load` (main frame) or a second `render-process-gone` within one minute. The first `render-process-gone` triggers one automatic `reload()`.

- `loading`: spinner in the tab.
- `ready`: normal (QR screen and chat list are both `ready`; MultiWA does not distinguish them).
- `offline`: tab shows a warning glyph; the pane shows a local shell page with the error text and a **Reload** button (loads `web.whatsapp.com` again in the same view).

## 8. Downloads — `src/main/downloads/DownloadManager.ts`

`session.on('will-download')` on every `persist:wa-*` session:

1. Target: `app.getPath('downloads')/<sanitized filename>`; on collision `name (2).ext`, `name (3).ext`, ….
2. `item.setSavePath(target)`; no dialog.
3. On `done`/`completed`: in-app toast "Saved <name>" with **Show in folder** (`shell.showItemInFolder`) and an OS notification with the same action when the owning window is not focused. On `interrupted`/`cancelled`: toast with the error.

File attachment (native picker, drag-and-drop) and clipboard paste need no app code.

## 9. Notifications — `src/main/app/ShellApp.ts`

- WhatsApp Web's own `Notification` API calls become native OS notifications (permission granted in §5). Clicking one activates the owning Account's tab in its window (Sidekick's notification → tab activation path), without recreating anything. The notification body is not read or stored by MultiWA.
- MultiWA itself only raises notifications for downloads (§8) and the `offline` state when the account is not in front.
- No per-message toasts from MultiWA; WhatsApp renders its own.

## 10. Persistence — `src/main/app/AppStateStore.ts`

Ported as-is. File: `<userData>/app-state.json`, user data folder `<appData>/AvvaMobile.MultiWA` (`MULTIWA_USER_DATA` overrides). Atomic write (temp + rename), schema version with migration hook, corrupt file → renamed to `.corrupt-<ts>` and state reset.

```ts
type AppState = {
  schemaVersion: 1;
  accounts: { id: string; name: string; color: string; order: number; windowId: string }[];
  windows: { id: string; isMain: boolean; bounds?: Rectangle; activeAccountId: string | null;
             splitRatio: number; rightPaneAccountId: string | null }[];
  prefs: { lastVersionSeen: string };
};
```

Never persisted: views, sessions, unread counts, cookies or anything from the page.

## 11. IPC — `src/preload/shell.ts`, `src/shared/ipc.ts`

Typed `contextBridge` API for the shell renderer only:

- `accounts.add(): Promise<AccountId>`, `rename(id, name)`, `remove(id)` (main shows the confirmation dialog), `select(id)`, `reorder(ids[])`
- `windows.moveToNew(id)`, `moveToMain(id)`
- `split.show(id)`, `hide()`, `toggle()`, `setRatio(ratio)` (fire-and-forget during drag, persisted on drag end)
- `view.reload(id)`
- `state.subscribe(cb)` → shell view model (accounts, states, unread, windows)

Every handler validates `event.senderFrame` (must be a shell renderer) and the input shape (Sidekick `settingsValidation` style). Nothing else is exposed: no `ipcRenderer`, no session objects, no arbitrary channels. Account views have no preload at all.

## 12. Menu and shortcuts

App menu (Sidekick `ShellApp` menu minus Claude/ChatGPT items): File → New Account (`⌘T`), Close Account (`⌘W`, confirmation), New Window (`⌘N`); View → Toggle Right Pane (`⌘\`), Reload Account (`⌘R`), Zoom; Window → standard; Help → Check for Updates…, Open Logs Folder, About. `⌘1…⌘9` select tab *n*; `⌃Tab` / `⌃⇧Tab` cycle tabs.

## 13. Diagnostics

Sidekick `diagnosticsLog.ts`: rotating log file in `<userData>/logs`, `MULTIWA_DIAG_CONSOLE=1` mirrors to stdout. Logged: navigation blocks, permission decisions, download events, state transitions, process crashes. Never logged: URLs with query strings from WhatsApp, titles, notification bodies.

## 14. Packaging and release — `electron-builder.yml`, `scripts/release-mac.sh`, `docs/RELEASING.md`

Ported from Sidekick with the new identifiers:

- `appId: com.avvamobile.multiwa`, `productName: MultiWA`, artifacts `MultiWA-<version>-<arch>.dmg` / `-mac.zip`, `MultiWA-Setup-<version>.exe`.
- macOS: arm64 + x64, DMG + zip, hardened runtime, Developer ID from the release Mac's keychain, notarization via App Store Connect API key env vars. Windows: NSIS x64, per-user, unsigned (SmartScreen note in README).
- Updates: `electron-updater` against GitHub Releases of `AvvaMobile/MultiWA` (`latest-mac.yml`, `latest.yml`). `MULTIWA_NO_UPDATES=1` disables.
- **No CI.** No `.github/workflows`. Release procedure: bump version → `npm run dist:mac` / `dist:win` (Windows build on a Windows machine or Rosetta) → `gh release create vX.Y.Z` → upload artifacts and `latest*.yml` locally. `release-mac.sh` already does build + sign + notarize + upload; it is kept and pointed at the new repo.
- Setup checklist and its dialog are not ported (no external tool dependencies).

## 15. Stack

Electron 44 (`WebContentsView`), TypeScript 5.9, electron-vite 5, Vite 7, React 19, electron-builder 26, Vitest 4 + happy-dom. Node ≥ 22.12. No native modules.

## 16. Folder layout

```
src/
  domain/            pure, Electron-free, unit-tested
    layout/          splitPane.ts (ported)
    accounts/        order.ts (ported tab order), palette.ts
    unread/          parseTitle.ts
  main/
    app/             ShellApp.ts, shellWindows.ts, AppStateStore.ts, updater.ts, diagnosticsLog.ts
    accounts/        AccountRuntime.ts (view + state), AccountManager.ts (create/remove/move)
    security/        origins.ts, permissions.ts, remoteContent.ts, userAgent.ts
    downloads/       DownloadManager.ts
    layout/          SplitLayoutController.ts (ported)
  preload/shell.ts
  renderer/shell/    App.tsx, TabBar.tsx, RightPaneHeader.tsx, OfflinePage.tsx, Toasts.tsx, viewModel.ts, api.ts
  shared/            models.ts, ipc.ts, state.ts
  __tests__/         isolationBoundaries.test.ts
docs/                ARCHITECTURE.md, SECURITY.md, RELEASING.md, DECISIONS.md
build/               icon.icns, icon.png, entitlements.mac.plist
scripts/             release-mac.sh, dev-bundle.cjs
```

## 17. Testing

Unit (Vitest): `parseTitle`, tab order, `splitPane` geometry, origins allowlist, permission decisions, download target collision naming, `AppStateStore` (atomic write, migration, corrupt recovery), IPC input validation, isolation boundaries, `TabBar` drag/rename/close-confirm (happy-dom).

Manual verification checklist (documented in `docs/WORKFLOW.md`): two accounts linked by QR in two tabs; both stay signed in after restart; messages arrive in the background tab and the badge/Dock count update; OS notification click selects the right tab; voice message record, voice/video call permission prompts once; media download lands in Downloads; tab moved to a second window keeps its chat state; right pane shows a second account and survives resize; removing an account clears its partition directory.

## 18. Out of scope (v1)

Auto-naming tabs from the WhatsApp profile, per-account notification muting, DOM-based unread counts, proxy settings per account, Linux builds, Windows code signing, keyboard-shortcut customization, i18n.
