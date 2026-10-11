# MultiWA Security

MultiWA embeds remote web content (WhatsApp Web) for several accounts at once. These rules are architectural requirements.

## Trust model
Trusted: packaged MultiWA code, validated local user actions. Untrusted: everything from `web.whatsapp.com` (DOM, titles, notification bodies, download names, URLs).

## Remote content (account views)
- `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, `webSecurity:true`, `allowRunningInsecureContent:false`, no experimental features, `webviewTag:false`.
- **No preload, no bridge, no `executeJavaScript`.** The only page signals read are the title, load/crash events and `will-download`. The one thing written into the page is a static layout stylesheet (`insertCSS`, see `src/main/accounts/whatsappLayoutCss.ts`): it narrows the chat list and lifts WhatsApp's 748 px minimum width so split panes fit. CSS only, no script.
- Top-level navigation only to `https://*.whatsapp.com` / `https://*.whatsapp.net`; everything else is blocked and, if `http(s)`, opened in the OS browser (rate-limited). `window.open` is always denied in-app.
- Permissions granted to the WhatsApp main frame only: `media` (audio/video), `notifications`, `clipboard-read`, `clipboard-sanitized-write`, `fullscreen`. All others and all other origins denied. Device (USB/HID/serial/Bluetooth) and display-capture requests denied.
- One session partition per account; partitions never share cookies or storage.

## Shell renderer
Packaged code, sandboxed, typed `contextBridge` with fixed channels. No `ipcRenderer`, `fs`, `child_process`, session objects or arbitrary channels exposed.

## IPC
Every handler verifies the sender frame is the bundled shell page in a known shell window and validates input shapes. Downloads are revealed by id; the renderer never names a path.

## Downloads
Saved only under `app.getPath('downloads')` with a sanitized, unique basename (`downloadTarget.ts`). No dialog, no execution.

## Logging
`<userData>/logs/events.log`: navigation decisions (origin + path only), permission decisions, download outcomes, status changes. Never titles, notification bodies or query strings.

## Packaging
Hardened runtime, notarized macOS builds, Electron fuses (`runAsNode` off, asar integrity on, only-load-from-asar on). Windows builds are unsigned for now.

## Reporting
Open a private security advisory on the GitHub repository.
