import { existsSync, lstatSync, readFileSync, readlinkSync } from 'node:fs';
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

// Case-insensitive containment in either direction — a real citation may be a shortened prefix
// of the full anchor text (docs/ENGINEERING_RULES.md-style), or a short invented shorthand label
// embedded inside a longer bullet/heading (e.g. "Gotchas (traffic-pin precedent)" citing a label
// that appears mid-sentence, not at the anchor's own start) — both are legitimate, pre-existing
// conventions in this codebase, not detector bugs (verified 2026-09-20 against real content in
// docs/CODE_STANDARDS.md and infra/terraform/README.md).
function citationResolves(targetContent: string, citation: string): boolean {
  const normalizedCitation = normalizeHeadingText(citation);
  if (!normalizedCitation) return false;
  return collectAnchorCandidates(targetContent).some((raw) => {
    const normalized = normalizeHeadingText(raw);
    return normalized.includes(normalizedCitation) || normalizedCitation.includes(normalized);
  });
}

function checkRequiredAnchors(content: string, policy: AgentContextPolicy): Finding[] {
  const findings: Finding[] = [];
  for (const anchor of policy.requiredAnchors) {
    if (!content.includes(anchor)) {
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

function checkPointers(rootDir: string, content: string, policy: AgentContextPolicy): Finding[] {
  const findings: Finding[] = [];
  let match;
  POINTER_REGEX.lastIndex = 0;
  while ((match = POINTER_REGEX.exec(content))) {
    const [, path, tail] = match;
    const line = lineNumberAt(content, match.index);
    const absolutePath = resolve(rootDir, path);
    if (!existsSync(absolutePath)) {
      findings.push({
        rule: RULE,
        file: policy.targetFile,
        line,
        message: `Pointer target does not exist: ${path}`,
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
// edit, not a story-history citation accumulating over time — exempt regardless of its value.
const LAST_UPDATED_LINE_REGEX = /^\*\*Last updated:\*\*/;

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
    if (!headingMatch) continue;
    const sectionKey = headingMatch[1];
    const budget = policy.budgets.sections[sectionKey];
    if (!budget) continue;
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
export function checkAgentContextFile(rootDir: string, policy: AgentContextPolicy): ScanResult {
  const absolutePath = resolve(rootDir, policy.targetFile);
  if (!existsSync(absolutePath)) {
    return { rule: RULE, scannedTargets: 0, findings: [] };
  }
  const content = readFileSync(absolutePath, 'utf8');
  const findings: Finding[] = [
    ...checkRequiredAnchors(content, policy),
    ...checkPointers(rootDir, content, policy),
    ...checkForbiddenPatterns(content, policy),
    ...checkBudgets(content, policy),
    ...checkSymlinks(rootDir, policy),
  ];
  return { rule: RULE, scannedTargets: 1, findings };
}
