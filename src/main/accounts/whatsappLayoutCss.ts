/**
 * Stylesheet inserted into every WhatsApp Web view once its DOM is ready (`webContents.insertCSS`,
 * no script, no bridge). It only adjusts layout:
 *
 * - WhatsApp gives the chat list 45% of the window; in a wide window that is 600+ px of list.
 *   The list is pinned to clamp(260px, 30%, 400px) instead.
 * - WhatsApp forces a 748 px minimum width and overflows a narrower pane (split view, small windows).
 *   The floor is lifted so both columns shrink instead of being cut off.
 *
 * The selectors are the stable ids WhatsApp exposes (`#side`, `.two`); when WhatsApp renames them the
 * rules simply stop matching and the page falls back to its own layout.
 */
export const WHATSAPP_LAYOUT_CSS = `
.two { min-width: 0 !important; }
.two > div:has(> #side) { flex: 0 0 clamp(260px, 30%, 400px) !important; max-width: none !important; }
`;
