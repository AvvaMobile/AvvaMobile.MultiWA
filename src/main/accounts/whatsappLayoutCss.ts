/**
 * Stylesheet inserted into every WhatsApp Web view once its DOM is ready (`webContents.insertCSS`,
 * no script, no bridge). It only adjusts layout:
 *
 * - WhatsApp gives the chat list 45% of the window; in a wide window that is 600+ px of list.
 *   The list is pinned to clamp(260px, 30%, 400px) instead. WhatsApp also keeps a pointer-events:none
 *   overlay inside `.two` that mirrors the two columns and draws their divider lines; its first column
 *   gets the same width so the divider does not float in the middle of the chat.
 * - WhatsApp forces a 748 px minimum width and overflows a narrower pane (split view, small windows).
 *   The floor is lifted so both columns shrink instead of being cut off.
 *
 * The selectors are structural (`.two`, `#side`, `#main`, child positions), not WhatsApp's generated
 * class names; when WhatsApp changes its markup the rules simply stop matching and the page falls back
 * to its own layout.
 */
export const WHATSAPP_LAYOUT_CSS = `
.two { min-width: 0 !important; }
.two > div:has(> #side),
.two > div:not(:has(#side, #main, header)) > div:first-child:nth-last-child(2) {
  flex: 0 0 clamp(260px, 30%, 400px) !important;
  max-width: none !important;
}
`;
