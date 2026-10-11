# MultiWA

> **Security first.** MultiWA collects no data and sends nothing anywhere. There is no MultiWA account, no server and no analytics. The app talks only to `web.whatsapp.com` and, for updates, to GitHub Releases. It never reads your messages: the one thing it takes from WhatsApp Web is the window title, to show the unread count. [How this is enforced →](docs/SECURITY.md)

Several WhatsApp accounts, one window. A desktop app for macOS and Windows that runs several WhatsApp Web sessions side by side, one per tab, each with its own login.

Website: https://avvamobile.github.io/AvvaMobile.MultiWA/

![MultiWA with three account tabs; two accounts open side by side](docs/images/multiwa.png)

## What it does

- **One tab per account.** Each tab is a separate WhatsApp Web session (own cookies, own storage). Scan the QR code once per tab; every account stays signed in after you quit and reopen.
- **Tabs you can shape.** Drag to reorder, double-click to rename, each tab has its own colour. Unread counts sit on the tabs; the total shows on the Dock / taskbar icon.
- **Two accounts side by side.** Right-click a tab → *Show in Right Pane* (or `⌘\` / `Ctrl+\`), drag the divider.
- **Several windows.** Right-click a tab → *Move to New Window*. Closing that window returns the tab.
- **Everything WhatsApp Web can do.** Voice notes, voice and video calls, notifications, attachments, pasting images. Downloads land in your Downloads folder.
- **Keyboard.** `⌘1`–`⌘9` select a tab, `⌃Tab` cycles, `⌘T` adds an account, `⌘R` reloads one, `⌘W` removes one (asks first). `Ctrl` instead of `⌘` on Windows.

## Install

Download from [Releases](https://github.com/AvvaMobile/AvvaMobile.MultiWA/releases/latest):

- macOS: `MultiWA-<version>-arm64.dmg` (Apple silicon) or `MultiWA-<version>-x64.dmg` (Intel). Signed and notarized; updates install themselves.
- Windows: `MultiWA-Setup-<version>.exe`. Per-user install, no admin rights. The installer is not code-signed yet: SmartScreen → *More info* → *Run anyway*.

## Privacy and security

- WhatsApp Web runs in a sandboxed view with **no preload and no bridge** to Node or your computer.
- Navigation is allowed only inside `whatsapp.com` / `whatsapp.net`; every other link opens in your default browser.
- WhatsApp can ask for the microphone, camera, notifications, clipboard and fullscreen. Every other permission (location, USB, screen capture, …) is denied.
- One session partition per account; partitions never share anything.
- The local diagnostics log holds navigation decisions (origins only), permission decisions and download outcomes. Never titles, message text, notification bodies or URLs with paths or queries.
- Signed macOS builds with the hardened runtime and Electron fuses (no Node runtime mode, app integrity checked).

Full requirements: [docs/SECURITY.md](docs/SECURITY.md). Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Removing an account

Close its tab (✕) and confirm. The session is wiped from this computer, including its storage folder. Nothing on your phone changes; unlink the device there if you want to.

## Support the project

MultiWA is free and open source. If it saves you time, you can [buy me a coffee](https://buymeacoffee.com/muratyilmaz).

## Development

```sh
npm install
npm run dev          # electron-vite dev server
npm test             # vitest (unit tests, isolation-boundary guard)
npm run typecheck
npm run dist:mac     # local package; see docs/RELEASING.md
```

Releases are built and uploaded locally; there is no CI. Manual verification checklist: [docs/WORKFLOW.md](docs/WORKFLOW.md).

MultiWA is an independent app by [Avva Mobile](https://avvamobile.com). It is not affiliated with WhatsApp or Meta. MIT licensed.
