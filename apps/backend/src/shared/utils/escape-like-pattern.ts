// A literal `%`, `_`, or `\` in a caller-supplied search term is also a wildcard/escape character
// to Postgres's LIKE/ILIKE engine — unescaped, wrapping such a term in our own `%...%`
// contains-pattern lets the caller's own wildcards leak through (e.g. a short input like `%%%`
// passes the schema's non-empty length check while producing an unselective pattern with no
// extractable trigram, defeating a pg_trgm-backed search's whole point — M20-S12, Codex review
// finding PR #434 round 3; the length check itself no longer requires 3+ characters as of
// M20-S13, but escaping still matters regardless of the minimum).
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
