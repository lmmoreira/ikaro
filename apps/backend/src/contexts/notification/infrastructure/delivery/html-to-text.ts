import { unescapeHtml } from '../../../../shared/utils/escape-html';

// The plain-text alternative of an email body. A multipart/alternative message with a real text
// part is what spam filters and text-only clients expect; deriving it here keeps every use case
// writing one HTML body only. Bodies are our own catalog HTML plus escaped values, so a small
// converter is enough — it is not a general HTML parser. It scans tag by tag (no backtracking
// regular expression over the whole body).

const BLOCK_END_TAGS = new Set([
  'p',
  'div',
  'tr',
  'table',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);
const CELL_END_TAGS = new Set(['td', 'th']);

function tagName(tag: string): string {
  const name = /^\/?([a-z][a-z0-9]*)/i.exec(tag);
  return name?.[1]?.toLowerCase() ?? '';
}

function hrefOf(tag: string): string | null {
  return /href="([^"]*)"/.exec(tag)?.[1] ?? null;
}

interface LinkState {
  href: string | null;
  labelStart: number;
}

function emitTag(out: string[], link: LinkState, tag: string): void {
  const name = tagName(tag);
  const closing = tag.startsWith('/');

  if (name === 'a') {
    if (!closing) {
      link.href = hrefOf(tag);
      link.labelStart = out.length;
    } else if (link.href !== null) {
      // The address follows its label, unless the label already is the address.
      if (out.slice(link.labelStart).join('').trim() !== link.href) out.push(` (${link.href})`);
      link.href = null;
    }
  } else if (name === 'br' || (closing && BLOCK_END_TAGS.has(name))) {
    out.push('\n');
  } else if (closing && CELL_END_TAGS.has(name)) {
    out.push('\t');
  }
}

function stripTags(html: string): string {
  const out: string[] = [];
  const link: LinkState = { href: null, labelStart: 0 };
  let index = 0;

  while (index < html.length) {
    const open = html.indexOf('<', index);
    const close = open === -1 ? -1 : html.indexOf('>', open);
    if (close === -1) {
      // No more complete tags: what is left is text (an unterminated tag is kept as written).
      out.push(html.slice(index));
      break;
    }
    out.push(html.slice(index, open));
    emitTag(out, link, html.slice(open + 1, close));
    index = close + 1;
  }
  return out.join('');
}

function tidyLine(line: string): string {
  const cells = line.split('\t').map((cell) => cell.trim());
  while (cells.length > 1 && cells.at(-1) === '') cells.pop();
  return cells.join(' | ').trim();
}

export function htmlToText(html: string): string {
  return unescapeHtml(stripTags(html).replaceAll('&nbsp;', ' '))
    .split('\n')
    .map(tidyLine)
    .join('\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();
}
