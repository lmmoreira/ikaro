import { htmlToText } from './html-to-text';

describe('htmlToText', () => {
  it('puts each paragraph on its own line', () => {
    expect(htmlToText('<p>Olá, Ana!</p><p><strong>Data:</strong> 01/07/2026</p>')).toBe(
      'Olá, Ana!\nData: 01/07/2026',
    );
  });

  it('keeps a link readable by writing its address after the label', () => {
    expect(htmlToText('<p><a href="https://app.example/x?token=1">Responder</a></p>')).toBe(
      'Responder (https://app.example/x?token=1)',
    );
  });

  it('does not repeat an address that is already the label', () => {
    expect(htmlToText('<a href="https://a.example">https://a.example</a>')).toBe(
      'https://a.example',
    );
  });

  it('turns a table into one line per row, cells separated by a bar', () => {
    const html =
      '<table><thead><tr><th>Horário</th><th>Cliente</th></tr></thead><tbody><tr><td>10:00</td><td>João</td></tr></tbody></table>';
    expect(htmlToText(html)).toBe('Horário | Cliente\n10:00 | João');
  });

  it('decodes the entities escapeHtml produces, ampersand last', () => {
    expect(htmlToText('<p>&lt;b&gt; &amp;lt; &quot;x&quot; &#x27;y&#x27;</p>')).toBe(
      '<b> &lt; "x" \'y\'',
    );
  });

  it('collapses runs of blank lines', () => {
    expect(htmlToText('<p>A</p><br><br><br><p>B</p>')).toBe('A\n\nB');
  });

  it('keeps the address of a link whose label has formatting inside', () => {
    expect(htmlToText('<a href="https://a.example/x"><strong>Responder</strong> agora</a>')).toBe(
      'Responder agora (https://a.example/x)',
    );
  });

  it('copes with an unterminated tag without throwing', () => {
    expect(htmlToText('<p>ok</p><p broken')).toBe('ok\n<p broken');
  });
});
