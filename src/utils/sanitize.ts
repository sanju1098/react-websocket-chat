/**
 * Strips HTML tags from user-supplied text before persistence.
 *
 * Design assumption (documented in APIDoc.md / README.md): message `text`
 * is ALWAYS plain text, never HTML. This is defense-in-depth on the server
 * side; the PRIMARY XSS defense is that every client (web/mobile) MUST
 * render message text as plain text (e.g. React JSX text interpolation,
 * DOM `textContent`, or an equivalent safe-text API) and must NEVER inject
 * it via `innerHTML` / `dangerouslySetInnerHTML` without escaping.
 *
 * This intentionally does NOT HTML-entity-encode the text (which would
 * alter/corrupt the literal characters a user typed, e.g. "5 < 10").
 * Instead it removes only well-formed tag-like sequences (`<tag ...>`),
 * neutralizing the most common injection vectors (`<script>`, `<img onerror>`,
 * `<svg onload>`, etc.) while leaving ordinary punctuation untouched.
 */
export function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim();
}
