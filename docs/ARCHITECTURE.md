# MultiWA Architecture

Status: current implementation. Security requirements: [SECURITY.md](SECURITY.md); release procedure: [RELEASING.md](RELEASING.md); manual checks: [WORKFLOW.md](WORKFLOW.md). Design origin: `docs/superpowers/specs/2026-10-11-multiwa-design.md`.

## 1. Product boundaries

MultiWA:

- embeds `https://web.whatsapp.com` as remote, isolated content, once per account, each with its own persistent session partition;
- keeps every open account alive at once and switches between them without reloading;
- shows unread counts per tab and in total (Dock / taskbar), and routes WhatsApp's own OS notifications back to the right tab;
- lets the user move tabs between windows and show two accounts side by side in one window;
- downloads media to `~/Downloads`; allows microphone, camera, notifications and clipboard for WhatsApp only.

MultiWA does not: reimplement any WhatsApp feature, read or store message content or credentials, give remote content any bridge to Node/Electron, scrape WhatsApp's DOM (the only page signal used is the window title), or use CI for builds and releases.

## 2. Concepts

- **Account**: `id` (uuid), `name` (user-editable, default `Account N`), `color` (auto-assigned from a fixed palette), partition `persist:wa-<id>`, global tab `order`, `windowId`. Defined in `src/domain/accounts/account.ts`.
- **Window**: a shell `BrowserWindow` with its own tab strip, active account, split ratio and optional right-pane account. The main window (`id: 'main'`) always exists while the app runs.
- **Runtime**: the `WebContentsView` plus navigation/unread state of one Account (`AccountRuntime`). Created at startup for every Account, destroyed only on account removal or quit.

## 3. Process boundaries

- **Main process** owns windows, `WebContentsView`s, sessions, permissions, downloads, persistence, menu, notifications. It never trusts renderer input.
- **Shell renderer** (React, packaged code, sandboxed) draws the tab strip, splitter, right-pane header, offline page and toasts; talks to main only through `window.multiwa` (preload `contextBridge`).
- **Account views** are remote, untrusted content with **no preload and no bridge**. MultiWA reads only `page-title-updated`, load/crash events and `will-download`.

## 4. Module map

| Concern | Module |
| --- | --- |
| Bootstrap, single instance, userData | `src/main/index.ts` |
| Windows, IPC, menu, notifications, lifecycle | `src/main/app/ShellApp.ts` |
| Multi-window helpers (pure) | `src/main/app/shellWindows.ts` |
| Persisted state | `src/main/app/AppStateStore.ts` (`<userData>/app-state.json`) |
| Pane layout per window | `src/main/layout/PaneLayoutController.ts` |
| Account view + status | `src/main/accounts/AccountRuntime.ts`, `runtimeState.ts` |
| Origins, permissions, hardened view | `src/main/security/origins.ts`, `permissions.ts`, `remoteContent.ts` |
| Downloads | `src/main/downloads/DownloadManager.ts`, `downloadTarget.ts` |
| Updates, diagnostics | `src/main/app/updater.ts`, `src/main/diagnostics/diagnosticsLog.ts` |
| Pure geometry / naming / parsing | `src/domain/**` |
| Shared types and API contract | `src/shared/state.ts`, `api.ts`, `shellLayout.ts` |
| Preload bridge | `src/preload/shell.ts` |
| Shell UI | `src/renderer/shell/**` |
| Architectural guard test | `src/__tests__/isolationBoundaries.test.ts` |

## 5. Session partitioning

One `persist:wa-<accountId>` partition per account (`partitionFor`). The partition's user agent has the `Electron/x` and app tokens stripped (`chromeLikeUserAgent`) so WhatsApp Web sees a normal Chromium. Removing an account calls `clearStorageData()` + `clearCache()` and deletes `<userData>/Partitions/wa-<id>`.

## 6. Layout and windows

- **Tab bar** (`TabBar.tsx`): one tab per Account, browser-style, drag to reorder, double-click to rename, right-click context menu (Rename, Show in / Hide Right Pane, Move to New / Main Window, Reload, Remove Account). `+` creates a new Account immediately: a new partition, a new tab, `web.whatsapp.com` loads and shows the QR code. Closing a tab removes the account after a confirmation dialog shown by main.
- **Multiple windows**: each open tab lives in exactly one window; each window has its own active tab and split layout. Moving a tab re-parents the existing `WebContentsView` (`attachTab`); nothing is recreated or reloaded. Closing a secondary window moves its tabs back to the main window. Closing the main window on macOS hides it; on Windows it quits.
- **Split pane** (`PaneLayoutController`): left pane = the window's active tab; right pane = empty or one other Account. `PaneGeometry { left, splitter, rightHeader, right }` is computed in main from `computeSplitGeometry`; the renderer recomputes the same geometry from `ShellState.splitRatio` with the same pure functions, so the splitter, right-pane header and overlays line up with the views. `⌘\` toggles the right pane (re-opens the last right-pane account). One Account is visible in exactly one place: activating the right-pane account swaps the panes; moving it to another window closes the right pane. The ratio is persisted per window on drag end.
- **Runtime rule**: tab switches, split toggles and moves between windows only call `setBounds` / `setVisible` / `addChildView` / `removeChildView`. Views are never navigated, reloaded or destroyed by layout changes.

## 7. Account status

`reduceRuntime` is a pure state machine: `loading → ready`; `offline` on main-frame `did-fail-load` (except `-3` ERR_ABORTED) or a second `render-process-gone` within 60 s; the first crash reloads once. Offline views are hidden (`PaneLayoutController.setHidden`) and the shell draws `OfflinePage` with a Reload button over the pane. Disposed runtimes ignore late events.

## 8. Unread

`parseUnreadFromTitle` on `page-title-updated` (`^\((\d+)\)` after optional direction marks, capped at 9999); tab badge per account; `app.setBadgeCount(sum)` for the Dock. If WhatsApp changes its title format, badges show nothing and nothing else breaks.

## 9. Notifications

WhatsApp Web's own `Notification` calls become OS notifications (permission granted to the WhatsApp main frame only). Click routing: the feasibility spike (`docs/M0-FEASIBILITY.md`, question 3) could not observe which Electron signal fires on a notification click, so **both branches are implemented** in `ShellApp.ts`:

1. the page's own focus request path: `AccountRuntime` forwards a `webContents 'focus'` event that the shell did not cause as `onAttention(id)` → `bringToFront(id)`;
2. the fallback: `onChange` records the account whose unread count rose most recently; `app.on('activate')` and `win.on('focus')` within 2 s of that increase bring that account to the front.

MultiWA raises its own notifications only for finished downloads and for an account going offline while its window is not focused. Notification bodies are never read or stored.

## 10. Downloads

`will-download` on every account session → `~/Downloads/<safe unique name>` (`sanitizeFilename`, `uniquePath`: `name (2).ext`, …), no dialog. On completion: toast "Saved <name>" (click reveals the file) plus an OS notification when the owning window is not focused. On failure: an error toast. The renderer only ever receives a download id; main resolves it to a path.

## 11. IPC

Channels: `shell:get-state`, `account:add|select|rename|remove|reorder|context-menu|reload`, `split:show|hide`, `download:reveal` (invoke), `layout:set-split` (send, `{ ratio, commit }`), pushes `shell:state|toast|command`. Every handler checks `event.senderFrame` against the bundled shell page (`isSamePage`) and the window's main frame, and validates inputs (`isId`, `validateAccountName`, `isValidSplitRatio`, `mergeWindowOrder`). A window reorders only its own tabs.

## 12. Persistence

`AppState { schemaVersion: 1, accounts[], windows[], prefs }` in `<userData>/app-state.json`; debounced atomic writes (temp + rename with Windows retry), defensive load (unknown window ids fall back to main, dangling references dropped, bad ratios reset), `.corrupt-<ts>` copy on parse failure, failed writes retried later. Never persisted: views, sessions, unread counts, titles, cookies or anything from the page.

## 13. Configuration

Environment variables only, no settings UI in v1:

- `MULTIWA_USER_DATA` — alternative profile folder (default `<appData>/AvvaMobile.MultiWA`).
- `MULTIWA_NO_UPDATES=1` — disables the auto-updater in packaged builds.
- `MULTIWA_DIAG_CONSOLE=1` — mirrors `<userData>/logs/events.log` to stdout.
