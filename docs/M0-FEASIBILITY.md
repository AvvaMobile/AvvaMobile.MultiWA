# M0 — Feasibility spike result

Date: 2026-10-11. Machine: macOS (Darwin 27.0.0, Apple Silicon). Spike: `spike/main.js` (throwaway, deleted after this document), run with `npx electron main.js`.

Versions (`process.versions`): Electron **44.7.0**, Chromium **152.0.7977.130**, Node **24.21.0**.

Setup: one `BrowserWindow`, two `WebContentsView`s side by side on `persist:wa-a` and `persist:wa-b`, `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, user agent with the `Electron/x` token stripped, permission request/check handlers granting `media`, `notifications`, `clipboard-read`, `clipboard-sanitized-write`, `fullscreen`. User data under `~/Library/Application Support/MultiWA-spike`.

## Question 1 — two independent logins, both persist across relaunch

**PASS.**

- Both halves showed the QR screen. Account A was linked with a UK phone, account B with a Turkish phone (two different WhatsApp accounts). Two independent chat lists appeared; no interference between partitions.
- `⌘Q`, relaunch: both halves loaded straight into their chat lists, no QR. Partition directories exist at `<userData>/Partitions/wa-a` and `<userData>/Partitions/wa-b`.
- Login survived three further relaunches during the spike.

## Question 2 — notification banner satisfied, OS notification on message

**Partially verified; OS delivery could not be tested with the unsigned dev binary.**

- With the permission handlers above, WhatsApp Web shows **no** "Turn on desktop notifications" banner in either account. `Notification.permission` evaluated inside the B page is `"granted"` (checked once via a diagnostic `executeJavaScript` in the spike only; the product never scripts the page).
- Incoming messages to B while the spike was in the background raised **no** macOS notification from the Electron process. A main-process `new Notification({...}).show()` test from the same spike (`Notification.isSupported() === true`) was also not shown and did not appear in Notification Center. macOS on this machine does not deliver notifications from the ad-hoc-signed `node_modules/electron` binary; there was no permission prompt either.
- The native WhatsApp.app on the same Mac (logged into account B) did raise its own notification for the same message, which confirms the message path but says nothing about Electron.
- Conclusion: the page-side half (permission granted, banner satisfied) is proven. OS delivery must be verified on the signed, packaged build in Task 15 (`MultiWA.app` with Developer ID signature, as Sidekick already does).

## Question 3 — which signal fires when the OS notification is clicked

**Not observable in the spike** (no Electron notification was delivered; see question 2).

Decision for Task 12 Step 4: implement **both** branches. `onAttention → bringToFront` for the case where the hidden view's `webContents` emits `focus`, plus the fallback that tracks `lastUnreadIncreaseAt` per account and, on `app.on('activate')` / `win.on('focus')` within 2 s of an unread increase, selects that account. Verified end-to-end in Task 15 on the signed build.

Signals that were observed in the spike for reference: `app activate` and `window focus` fire when the window is activated from the Dock or ⌘Tab; `webContents 'focus'` fires on the view that holds keyboard focus after activation (the last-clicked pane).

## Question 4 — `will-download` fires with a usable filename

**PASS.**

Opening an image in account A's media viewer and clicking the viewer's download icon logged:

```
[spike] will-download persist:wa-a WhatsApp Image 2026-10-10 at 1.33.02 PM.jpeg image/jpeg
```

`item.getFilename()` returns a complete, human-readable name with extension; `item.getMimeType()` is correct. Without `setSavePath` Electron shows the native save dialog, which Task 6 replaces with the Downloads-folder target.

## Title strings observed (`page-title-updated`)

| Title | When |
|---|---|
| `"WhatsApp Web"` | initial load |
| `"WhatsApp"` | logged in, no unread (also QR screen after first paint) |
| `"(2) WhatsApp"`, `"(3) WhatsApp"` | logged in, unread chats |

Format matches `^\((\d+)\)` for the unread count. No left-to-right mark was observed in front of the parenthesis on this account/locale; the parser still tolerates it (Review Focus #1).

## Other observations

- At ~700 px pane width (half of a 1400 px window) WhatsApp Web switches to its narrow layout and the left navigation rail collapse/expand control did not respond for the user. Not re-tested at full width. Relevant only to the split-pane minimum width (spec: 360 px); a single account filling the window is unaffected.
- `sandbox_extension_issue_file failed ... Electron Helper.app/Contents/Resources: 1 (Operation not permitted)` is printed once at startup by the unsigned dev binary; harmless.
- WhatsApp Web showed a "Get WhatsApp for Mac" promo in the chat list; cosmetic.

## Verdict

Product is viable as specified: separate partitions give fully separate, persistent logins (Q1), the page accepts the granted notification permission (Q2, page side) and downloads surface through `will-download` with usable names (Q4). OS-level notification delivery and click routing (Q2 OS side, Q3) are deferred to the signed build in Task 15; Task 12 ships both routing branches so either outcome works.
