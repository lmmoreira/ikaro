// A literal `%`, `_`, or `\` in a caller-supplied search term is also a wildcard/escape character
// to Postgres's LIKE/ILIKE engine — unescaped, wrapping such a term in our own `%...%`
// contains-pattern lets the caller's own wildcards leak through (e.g. a 3-character input like
// `%%%` passes a length guard while producing an unselective pattern with no extractable trigram,
// defeating a pg_trgm-backed search's whole point — M20-S12, Codex review finding PR #434 round 3).
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
