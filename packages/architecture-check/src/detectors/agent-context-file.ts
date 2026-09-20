import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Finding, ScanResult } from '../model';

export interface AgentContextSymlink {
  path: string;
  expectedTarget: string;
}

export interface AgentContextForbiddenPatternAllowlistEntry {
  text: string;
  rationale: string;
  owner: string;
  reviewBy: string;
}

export interface AgentContextSectionBudget {
  maxLines: number;
  maxChars: number;
}

export interface AgentContextPolicy {
  targetFile: string;
  symlinks: AgentContextSymlink[];
  requiredAnchors: string[];
  forbiddenPatterns: string[];
  forbiddenPatternAllowlist: AgentContextForbiddenPatternAllowlistEntry[];
  budgets: {
    file: AgentContextSectionBudget;
    sections: Record<string, AgentContextSectionBudget>;
  };
}

const RULE = 'agent-context-file';

// Matches a "→ `docs/...`" / "→ `infra/...`" pointer, capturing the path and everything after
// the closing backtick on the same line — the latter is inspected separately for an optional
// "§ <heading>" citation. Every real pointer in context.md follows this shape (verified 2026-09-20).
const POINTER_REGEX = /→\s*`((?:docs|infra)\/[^`]+)`([^\n]*)/g;
// Matches a pointer path opened with a backtick that never closes before end-of-line — the
// `[^`\n]*` + `$` combination can only match when no closing backtick exists on the rest of the
// line, so this never fires on a well-formed pointer (POINTER_REGEX already matches those).
const MALFORMED_POINTER_REGEX = /→\s*`((?:docs|infra)\/[^`\n]*)$/gm;
const SECTION_CITATION_REGEX = /^\s*§\s*(.+)$/;

// Strips a single trailing italicized annotation (e.g. " *(actively maintained)*") and a single
// trailing sentence-final period — both observed in real citations and not part of the heading
// itself (docs/ENGINEERING_RULES.md's "Cloud Run CPU throttling..." and "Transactions." cases).
function cleanCitation(rawTail: string): string {
  return rawTail
    .trim()
    .replace(/\s*\*\([^)]*\)\*\s*$/, '')
    .replace(/\.$/, '')
    .trim();
}

function normalizeHeadingText(text: string): string {
  return text
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/:$/, '')
    .toLowerCase();
}

// A citation resolves against a target doc's real anchors in one of three shapes this codebase
// actually uses: a markdown heading (docs/ENGINEERING_RULES.md-style), a bold-lead-in bullet
// label (25 such targets exist in that same file), or a table row's first-cell "Pattern" text
// (docs/ANTI_PATTERNS.md/CI_TRAPS.md have no heading per row at all). Matched by case-insensitive
// prefix in either direction, so a context.md citation may be a shortened version of the real
// anchor, or vice versa.
function collectAnchorCandidates(targetContent: string): string[] {
  const candidates: string[] = [];
  const headingRegex = /^#{1,6}\s+(.+)$/gm;
  const boldBulletRegex = /^-\s+\*\*([^*]+)\*\*:?/gm;
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
function occursAtWordBoundary(haystack: string, needle: string): boolean {
  const index = haystack.indexOf(needle);
  if (index === -1) return false;
  const isWordChar = (ch: string) => /[a-z0-9]/i.test(ch);
  const before = index > 0 ? haystack[index - 1] : '';
  const after = index + needle.length < haystack.length ? haystack[index + needle.length] : '';
  return !isWordChar(before) && !isWordChar(after);
}

// A real citation may be a shortened prefix of the full anchor text (docs/ENGINEERING_RULES.md-
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
function citationResolves(targetContent: string, citation: string): boolean {
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

function checkRequiredAnchors(content: string, policy: AgentContextPolicy): Finding[] {
  const findings: Finding[] = [];
  const normalizedContent = normalizeHeadingText(content);
  for (const anchor of policy.requiredAnchors) {
    // Word-boundary match, not raw `.includes()` — a plain substring check would let "PR GATE"
    // survive being reworded to "PR GATEWAY".
    if (!occursAtWordBoundary(normalizedContent, normalizeHeadingText(anchor))) {
      findings.push({
        rule: RULE,
        file: policy.targetFile,
        line: 1,
        message: `Required anchor missing: "${anchor}". This phrase is a non-negotiable gate/invariant marker — deleting or rewording it past recognition breaks the guard.`,
      });
    }
  }
  return findings;
}

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function checkMalformedPointers(content: string, policy: AgentContextPolicy): Finding[] {
  const findings: Finding[] = [];
  let match;
  MALFORMED_POINTER_REGEX.lastIndex = 0;
  while ((match = MALFORMED_POINTER_REGEX.exec(content))) {
    findings.push({
      rule: RULE,
      file: policy.targetFile,
      line: lineNumberAt(content, match.index),
      message: `Pointer has an opening backtick with no closing backtick: "${match[1]}" — the path is unterminated, not just unresolvable.`,
    });
  }
  return findings;
}

function checkPointers(rootDir: string, content: string, policy: AgentContextPolicy): Finding[] {
  const findings: Finding[] = [];
  let match;
  POINTER_REGEX.lastIndex = 0;
  while ((match = POINTER_REGEX.exec(content))) {
    const [, path, tail] = match;
    const line = lineNumberAt(content, match.index);
    const absolutePath = resolve(rootDir, path);
    const allowedRoot = resolve(rootDir, path.startsWith('docs/') ? 'docs' : 'infra');
    if (absolutePath !== allowedRoot && !absolutePath.startsWith(`${allowedRoot}/`)) {
      findings.push({
        rule: RULE,
        file: policy.targetFile,
        line,
        message: `Pointer path escapes its own root via traversal: ${path}`,
      });
      continue;
    }
    if (!existsSync(absolutePath)) {
      findings.push({
        rule: RULE,
        file: policy.targetFile,
        line,
        message: `Pointer target does not exist: ${path}`,
      });
      continue;
    }
    // `existsSync` is also true for a directory — reading one with `readFileSync` throws `EISDIR`
    // and would crash the whole CLI run instead of reporting a line-numbered finding.
    if (!statSync(absolutePath).isFile()) {
      findings.push({
        rule: RULE,
        file: policy.targetFile,
        line,
        message: `Pointer target is not a regular file: ${path}`,
      });
      continue;
    }
    // The lexical containment check above only rejects `../`-style traversal in the *written*
    // path — a symlink living inside docs/ or infra/ that itself resolves outside that root would
    // still pass it, since `existsSync`/`readFileSync` follow symlinks transparently. Compare real,
    // symlink-resolved paths too.
    const realAllowedRoot = realpathSync(allowedRoot);
    const realTargetPath = realpathSync(absolutePath);
    if (realTargetPath !== realAllowedRoot && !realTargetPath.startsWith(`${realAllowedRoot}/`)) {
      findings.push({
        rule: RULE,
        file: policy.targetFile,
        line,
        message: `Pointer target resolves outside its own root via a symlink: ${path}`,
      });
      continue;
    }
    const citationMatch = tail.match(SECTION_CITATION_REGEX);
    if (!citationMatch) continue;
    const citation = cleanCitation(citationMatch[1]);
    const targetContent = readFileSync(absolutePath, 'utf8');
    if (!citationResolves(targetContent, citation)) {
      findings.push({
        rule: RULE,
        file: policy.targetFile,
        line,
        message: `Pointer § heading does not resolve in ${path}: "${citation}" matches no heading, bold-lead-in bullet, or table row there.`,
      });
    }
  }
  return findings;
}

// The file's own "**Last updated:** <date>" stamp is metadata that legitimately changes on every
// edit, not a story-history citation accumulating over time — exempt regardless of its value. The
// line must contain *only* the label and the date, so a forbidden pattern smuggled onto the same
// line (e.g. "**Last updated:** 2026-09-20 (see PR #999)") still gets caught — this is not a
// blanket per-line exemption.
const LAST_UPDATED_LINE_REGEX = /^\*\*Last updated:\*\*\s*(19|20)\d{2}-\d{2}-\d{2}\s*$/;

function checkForbiddenPatterns(content: string, policy: AgentContextPolicy): Finding[] {
  const findings: Finding[] = [];
  const allowlist = new Set(policy.forbiddenPatternAllowlist.map((entry) => entry.text));
  for (const source of policy.forbiddenPatterns) {
    const regex = new RegExp(source, 'g');
    let match;
    while ((match = regex.exec(content))) {
      const matchedText = match[0];
      if (allowlist.has(matchedText)) continue;
      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const lineEnd = content.indexOf('\n', match.index);
      const line = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      if (LAST_UPDATED_LINE_REGEX.test(line)) continue;
      findings.push({
        rule: RULE,
        file: policy.targetFile,
        line: lineNumberAt(content, match.index),
        message: `Forbidden pattern "${matchedText}" is not in the allowlist — context.md must not accumulate story-history literals (PR numbers, undated-exception ISO dates). Add a rationale/owner/reviewBy allowlist entry if this is a deliberate, permanent exception, or remove it.`,
      });
    }
  }
  return findings;
}

function checkBudgets(content: string, policy: AgentContextPolicy): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split('\n');
  if (
    lines.length > policy.budgets.file.maxLines ||
    content.length > policy.budgets.file.maxChars
  ) {
    findings.push({
      rule: RULE,
      file: policy.targetFile,
      line: 1,
      message: `File exceeds its budget: ${lines.length}/${policy.budgets.file.maxLines} lines, ${content.length}/${policy.budgets.file.maxChars} chars.`,
    });
  }
  const headingIndexes: number[] = [];
  lines.forEach((line, index) => {
    if (/^## /.test(line)) headingIndexes.push(index);
  });
  headingIndexes.push(lines.length);
  for (let i = 0; i < headingIndexes.length - 1; i++) {
    const start = headingIndexes[i];
    const end = headingIndexes[i + 1];
    const headingMatch = lines[start].match(/^## (\d+)\./);
    if (!headingMatch) {
      // Every real top-level section in this file is numbered by design (§10's own loading table
      // assumes it) — a heading that isn't never reaches the numbered-section budget check below
      // at all, which would let content moved into it evade the ratchet entirely while every
      // numbered section (and the file-wide total, if the move is offset elsewhere) stays flat.
      findings.push({
        rule: RULE,
        file: policy.targetFile,
        line: start + 1,
        message: `Top-level section "${lines[start].trim()}" is not numbered ("## N. Title") — every top-level section must be, or it has no budget entry and evades the ratchet entirely.`,
      });
      continue;
    }
    const sectionKey = headingMatch[1];
    const budget = policy.budgets.sections[sectionKey];
    if (!budget) {
      // Fail closed, not open: a numbered section with no policy entry (e.g. a new "## 18. ...")
      // would otherwise let content moved out of an existing, budgeted section evade its ratchet
      // entirely while the file-wide total stays flat.
      findings.push({
        rule: RULE,
        file: policy.targetFile,
        line: start + 1,
        message: `§${sectionKey} has no budget entry in agent-context-policy.json — add one (a new numbered section must be budgeted, not silently unbounded).`,
      });
      continue;
    }
    const sectionLines = lines.slice(start, end);
    const sectionChars = sectionLines.join('\n').length;
    if (sectionLines.length > budget.maxLines || sectionChars > budget.maxChars) {
      findings.push({
        rule: RULE,
        file: policy.targetFile,
        line: start + 1,
        message: `§${sectionKey} exceeds its budget: ${sectionLines.length}/${budget.maxLines} lines, ${sectionChars}/${budget.maxChars} chars.`,
      });
    }
  }
  return findings;
}

function checkSymlinks(rootDir: string, policy: AgentContextPolicy): Finding[] {
  const findings: Finding[] = [];
  for (const { path, expectedTarget } of policy.symlinks) {
    const absolutePath = resolve(rootDir, path);
    if (!existsSync(absolutePath)) {
      findings.push({
        rule: RULE,
        file: path,
        line: 1,
        message: `Expected symlink is missing: ${path}`,
      });
      continue;
    }
    const stats = lstatSync(absolutePath);
    if (!stats.isSymbolicLink()) {
      findings.push({
        rule: RULE,
        file: path,
        line: 1,
        message: `${path} must be a symlink to ${expectedTarget}, but is a real file — this breaks the "one canonical file" premise every agent tool relies on.`,
      });
      continue;
    }
    const rawTarget = readlinkSync(absolutePath);
    const resolvedTarget = resolve(dirname(absolutePath), rawTarget);
    const expectedAbsolute = resolve(rootDir, expectedTarget);
    if (resolvedTarget !== expectedAbsolute) {
      findings.push({
        rule: RULE,
        file: path,
        line: 1,
        message: `${path} is a symlink, but resolves to ${resolvedTarget} instead of the expected ${expectedAbsolute}.`,
      });
    }
  }
  return findings;
}

// Guards `.copilot/context.md` — the one file loaded into every agent session (Claude, Codex,
// Gemini) regardless of task. Deliberately not ts-morph/AST-based like every sibling detector in
// this directory: the target is a markdown instruction file, not TypeScript source, so this reads
// it directly and runs plain string/regex checks instead of scanning a `Project`. Returns the same
// `ScanResult` contract every sibling returns, and is wired into `cli.ts`'s `results` array the
// same way, so `scannedTargets = 1` (or 0, if the file is ever moved) triggers the CLI's existing
// zero-target guard unchanged. See `td/TD41-AGENT-CONTEXT-SLIMMING.md` Story 0 for the full design.
// checkSymlinks verifies the three aliases (CLAUDE.md, AGENTS.md, gemini.md) each correctly point
// AT `.copilot/context.md` — but says nothing about `.copilot/context.md` itself. If the canonical
// file were replaced by a symlink escaping the repo (while the three aliases still lexically point
// at its path), every other check here would silently read and validate the *escaped* content
// instead. This rejects that: the canonical file must be a real, contained file — either not a
// symlink at all, or a symlink that still resolves inside rootDir.
function checkCanonicalFileIsContained(
  rootDir: string,
  absolutePath: string,
  policy: AgentContextPolicy,
): Finding[] {
  const stats = lstatSync(absolutePath);
  if (!stats.isSymbolicLink()) return [];
  const realRoot = realpathSync(rootDir);
  const realTarget = realpathSync(absolutePath);
  if (realTarget === realRoot || realTarget.startsWith(`${realRoot}/`)) return [];
  return [
    {
      rule: RULE,
      file: policy.targetFile,
      line: 1,
      message: `${policy.targetFile} is itself a symlink resolving outside the repository (to ${realTarget}) — the canonical file must be a real, contained file, not an escaping symlink.`,
    },
  ];
}

export function checkAgentContextFile(rootDir: string, policy: AgentContextPolicy): ScanResult {
  const absolutePath = resolve(rootDir, policy.targetFile);
  if (!existsSync(absolutePath)) {
    return { rule: RULE, scannedTargets: 0, findings: [] };
  }
  const content = readFileSync(absolutePath, 'utf8');
  const findings: Finding[] = [
    ...checkCanonicalFileIsContained(rootDir, absolutePath, policy),
    ...checkRequiredAnchors(content, policy),
    ...checkMalformedPointers(content, policy),
    ...checkPointers(rootDir, content, policy),
    ...checkForbiddenPatterns(content, policy),
    ...checkBudgets(content, policy),
    ...checkSymlinks(rootDir, policy),
  ];
  return { rule: RULE, scannedTargets: 1, findings };
}
