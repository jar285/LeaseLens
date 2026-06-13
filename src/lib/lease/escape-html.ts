// Sprint 46.1 — HTML escaping for safe <mark> injection.
//
// react-pdf's customTextRenderer returns a STRING that the library
// re-parses as HTML (TextLayer.js: template.innerHTML = content) before
// sanitizing it. The text we wrap is user-supplied PDF content, so we
// escape it ourselves before injecting any <mark> — otherwise a lease
// containing "<b>" or "&" would emit stray (sanitized) nodes and corrupt
// the text layer. This is the PRIMARY control; react-pdf stripping on*
// handlers is defense-in-depth, not something we rely on.

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// `&` is in the character class first so the regex engine never re-reads
// an already-emitted entity — a single pass over the class is order-
// independent, but keeping `&` first documents the invariant.
const HTML_ESCAPE_RE = /[&<>"']/g;

export function escapeHtml(value: string): string {
  return value.replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPES[ch]);
}
