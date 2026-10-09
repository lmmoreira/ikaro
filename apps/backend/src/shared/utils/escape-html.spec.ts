import { escapeHtml, unescapeHtml } from './escape-html';

describe('escape-html', () => {
  it('escapes the five characters that can open markup or an attribute', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#x27;y&#x27;&gt;&amp;&lt;/a&gt;',
    );
  });

  it.each(['Lava & Cia', `<b>"x"</b> 'y'`, '&lt; already text', 'plain'])(
    'unescapeHtml reverses escapeHtml for %p',
    (value) => {
      expect(unescapeHtml(escapeHtml(value))).toBe(value);
    },
  );
});
