// Heading-citation helpers shared by the `agent-context-file` and `doc-link-integrity` detectors: a
// `§ <heading>` citation resolves against a target doc's headings, bold-lead-in bullets or table rows.

// Strips a single trailing italicized annotation (e.g. " *(actively maintained)*") and a single
// trailing sentence-final period — both observed in real citations and not part of the heading
// itself (docs/ENGINEERING_RULES_INFRA.md's "Cloud Run CPU throttling..." and docs/ENGINEERING_RULES_BACKEND.md's "Transactions." cases).
export function cleanCitation(rawTail: string): string {
  return rawTail
    .trim()
    .replace(/\s*\*\([^)]*\)\*\s*$/, '')
    .replace(/\.$/, '')
    .trim();
}

export function normalizeHeadingText(text: string): string {
  return (
    text
      .replace(/`/g, '')
      .replace(/\*\*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      // "6. Manifest Caching" and "6 Manifest Caching" name the same section.
      .replace(/^(\d+(?:\.\d+)*)\.\s/, '$1 ')
      .replace(/:$/, '')
      .toLowerCase()
  );
}

// A citation resolves against a target doc's real anchors in one of three shapes this codebase
// actually uses: a markdown heading (docs/ENGINEERING_RULES_BACKEND.md-style), a bold-lead-in
// bullet label (docs/ENGINEERING_RULES_SHARED.md alone has 16 such targets), or a table row's
// first-cell "Pattern" text (the ANTI_PATTERNS and CI_TRAPS docs have no heading per row at all). Matched by case-insensitive
// prefix in either direction, so a context.md citation may be a shortened version of the real
// anchor, or vice versa.
export function collectAnchorCandidates(targetContent: string): string[] {
  const candidates: string[] = [];
  const headingRegex = /^#{1,6}\s+(.+)$/gm;
  // A bold lead-in label opening a bullet, a numbered item or a paragraph: `- **Label**`,
  // `3. **Label**`, `**Label:** text`.
  const boldBulletRegex = /^\s*(?:[-*]\s+|\d+\.\s+)?\*\*([^*\n]+)\*\*:?/gm;
  const tableRowRegex = /^\|\s*([^|]+?)\s*\|/gm;
  let match;
  while ((match = headingRegex.exec(targetContent))) candidates.push(match[1]);
  while ((match = boldBulletRegex.exec(targetContent))) candidates.push(match[1]);
  while ((match = tableRowRegex.exec(targetContent))) {
    const cell = match[1].trim();
    if (/^-{2,}$/.test(cell) || /^(pattern|rule|wrong)/i.test(cell)) continue;
    candidates.push(cell);
  }
  return candidates;
}

// True if `needle` occurs in `haystack` with a real word boundary on both sides — the character
// immediately before/after the match, if any, is not alphanumeric. Plain `.includes()` would let
// "eal" match inside "real heading", or "a" match inside "an existing section" — this rejects
// both while still accepting a genuine phrase boundary (a space, a colon, a paren) on either side.
export function occursAtWordBoundary(haystack: string, needle: string): boolean {
  const index = haystack.indexOf(needle);
  if (index === -1) return false;
  const isWordChar = (ch: string) => /[a-z0-9]/i.test(ch);
  const before = index > 0 ? haystack[index - 1] : '';
  const after = index + needle.length < haystack.length ? haystack[index + needle.length] : '';
  return !isWordChar(before) && !isWordChar(after);
}

// A real citation may be a shortened prefix of the full anchor text (docs/ENGINEERING_RULES_BACKEND.md-
// style) — checked with a word-boundary match, so an unrelated real heading that merely starts
// with the same characters can't false-match, but a citation typo'd with a trailing suffix (e.g.
// "§ Transactions typo" against a real "## Transactions" heading) can't false-match either, since
// the short string here is always the *citation*, never the real anchor.
//
// The reverse direction — a short invented shorthand label embedded inside a longer bullet (e.g.
// "Gotchas (traffic-pin precedent)" citing a label that appears mid-sentence, not at the anchor's
// own start; verified 2026-09-20 against real content in infra/terraform/README.md) — is
// deliberately narrower than a general reverse word-boundary check: it only accepts the anchor
// text wrapped in literal parentheses in the citation, `(<anchor>)`, not the anchor appearing
// anywhere at a boundary. A general reverse check would also accept a real, correct anchor
// ("Transactions") as a false match against a *wrong*, typo'd citation ("Transactions typo") —
// the parens requirement is what a genuine shorthand-label citation actually looks like in this
// codebase, and a typo'd citation doesn't happen to look like that by accident.
export function citationResolves(targetContent: string, citation: string): boolean {
  const normalizedCitation = normalizeHeadingText(citation);
  if (!normalizedCitation) return false;
  return collectAnchorCandidates(targetContent).some((raw) => {
    const normalized = normalizeHeadingText(raw);
    return (
      occursAtWordBoundary(normalized, normalizedCitation) ||
      normalizedCitation.includes(`(${normalized})`)
    );
  });
}

export function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}
