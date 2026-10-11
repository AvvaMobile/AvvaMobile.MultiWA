# MultiWA manual verification

Run this checklist on a packaged build (`npm run dist:mac`, launch from `dist/`) before every release. Record pass/fail with the date in the results table at the bottom.

## Checklist

1. First launch shows "No accounts yet"; `+` creates `Account 1` and loads the QR page; `+` creates `Account 2`.
2. Link two different WhatsApp accounts by QR. Quit (⌘Q), relaunch: both still logged in, same tab order, same active tab.
3. Double-click a tab → rename to `Work` → Enter; title bar shows `Work`; survives relaunch. Escape cancels; empty name is rejected.
4. Drag a tab to reorder; order survives relaunch.
5. Send a message to the background account from a phone: its tab badge shows `1`, Dock badge shows the total; opening the chat clears both.
6. OS notification appears for the background account while MultiWA is not focused; clicking it brings MultiWA forward and shows that account's tab.
7. Record a voice note (microphone prompt once); start a voice call and a video call (camera prompt once); both media streams work.
8. Download an image and a document: files appear in `~/Downloads` with the original names; a second identical download gets ` (2)`; toast click reveals the file.
9. Paste an image from the clipboard into a chat; attach a file with the paper-clip; drag-and-drop a file onto a chat. All send.
10. Right-click → Show in Right Pane: two accounts side by side; divider drags and the ratio survives relaunch; `⌘\` hides/shows; clicking the right account's tab swaps panes.
11. Right-click → Move to New Window: tab moves without reload (chat scroll position kept); second window gets its own active tab; closing it returns the tab to the main window.
12. Turn off Wi-Fi, reload an account: tab shows the offline marker and the pane shows Reload; turn Wi-Fi on, Reload → ready.
13. Developer → WhatsApp DevTools → `Notification.permission` is `granted`; `navigator.userAgent` contains no `Electron`.
14. Remove an account (✕ → Remove): tab disappears, `<userData>/Partitions/wa-<id>` is gone, relaunch does not show it.
15. Click a link in a chat: it opens in the default browser, not in the pane.
16. Zoom in/out/reset affects only the focused account.
17. `MULTIWA_DIAG_CONSOLE=1` run: log shows permission ALLOW lines only for `https://web.whatsapp.com` and no URLs with `?`.

## Results

| Version | Date | Build | Items | Notes |
| --- | --- | --- | --- | --- |
| 0.1.0 | — | — | not yet run | filled in by Task 15 |
