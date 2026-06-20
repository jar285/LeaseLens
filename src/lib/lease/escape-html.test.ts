// Sprint 46.1 — HTML escaping for safe <mark> injection.
//
// react-pdf's customTextRenderer return value is parsed as HTML
// (TextLayer.js re-parses the string via template.innerHTML before
// sanitizing). The wrapped text is user-supplied PDF content, so it
// MUST be escaped before we inject any <mark> around it — otherwise a
// lease whose text contains "<b>" would emit a stray (sanitized) tag
// and corrupt the text layer. react-pdf strips on* handlers, but we
// escape as the primary control, not relying on that defense-in-depth.

import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escape-html';

describe('escapeHtml', () => {
  it('neutralizes an injected tag so no live element survives', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
  });

  it('escapes & first so existing entities are not double-mangled', () => {
    // If "<" were escaped before "&", "&lt;" would become "&amp;lt;".
    expect(escapeHtml('a < b & c')).toBe('a &lt; b &amp; c');
  });

  it('escapes all five HTML-significant characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('leaves plain clause text untouched', () => {
    expect(escapeHtml('Tenant shall pay rent on the first.')).toBe(
      'Tenant shall pay rent on the first.',
    );
  });

  it('returns an empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });
});
