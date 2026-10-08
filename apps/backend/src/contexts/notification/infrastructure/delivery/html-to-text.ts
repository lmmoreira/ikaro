// The plain-text alternative of an email body. A multipart/alternative message with a real text
// part is what spam filters and text-only clients expect; deriving it here keeps every use case
// writing one HTML body only. Bodies are our own catalog HTML plus escaped values, so a small
// converter is enough — it is not a general HTML parser.

const NAMED_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

export function htmlToText(html: string): string {
  const withLinks = html.replaceAll(
    /<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g,
    (_match, href: string, label: string) => (label.trim() === href ? href : `${label} (${href})`),
  );
  const withBreaks = withLinks
    .replaceAll(/<br\s*\/?>/g, '\n')
    .replaceAll(/<\/(p|div|tr|table|h[1-6]|li)>/g, '\n')
    .replaceAll(/<\/(td|th)>/g, '\t');
  const stripped = withBreaks.replaceAll(/<[^>]*>/g, '');
  const decoded = Object.entries(NAMED_ENTITIES)
    .reduce((text, [entity, char]) => text.replaceAll(entity, char), stripped)
    .replaceAll('&amp;', '&');
  return decoded
    .split('\n')
    .map((line) =>
      line
        .replaceAll('\t', ' | ')
        .replace(/( \| )+$/, '')
        .trim(),
    )
    .join('\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();
}
