import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  citationResolves,
  cleanCitation,
  lineNumberAt,
  normalizeHeadingText,
  occursAtWordBoundary,
} from '../doc-citations';
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

function checkForbiddenPatterns(content: string, policy: AgentContextPolicy): Finding[] {
  const findings: Finding[] = [];
  const allowlist = new Set(policy.forbiddenPatternAllowlist.map((entry) => entry.text));
  for (const source of policy.forbiddenPatterns) {
    const regex = new RegExp(source, 'g');
    let match;
    while ((match = regex.exec(content))) {
      const matchedText = match[0];
      if (allowlist.has(matchedText)) continue;
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
// zero-target guard unchanged. See TD41 Story 0 for the full design.
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
  // Not a regular file at all (a directory, a special file, or a symlink resolving to one) —
  // reading it would throw (EISDIR or worse) rather than produce a clean finding. Checked before
  // any read is attempted, not just when it's lexically a symlink: a plain directory replacing the
  // canonical file hits this exact crash too, with no symlink involved at all.
  if (!statSync(absolutePath).isFile()) {
    return [
      {
        rule: RULE,
        file: policy.targetFile,
        line: 1,
        message: `${policy.targetFile} is not a regular file — the canonical file must be readable, contained, real content.`,
      },
    ];
  }
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
  // Containment/regular-file checks run — and can short-circuit — *before* any read is attempted.
  // `readFileSync` on a directory or an escaping symlink throws rather than producing a finding, so
  // this must never run first (it did, in an earlier version of this function).
  const canonicalFileFindings = checkCanonicalFileIsContained(rootDir, absolutePath, policy);
  if (canonicalFileFindings.length > 0) {
    return { rule: RULE, scannedTargets: 1, findings: canonicalFileFindings };
  }
  const content = readFileSync(absolutePath, 'utf8');
  const findings: Finding[] = [
    ...checkRequiredAnchors(content, policy),
    ...checkMalformedPointers(content, policy),
    ...checkPointers(rootDir, content, policy),
    ...checkForbiddenPatterns(content, policy),
    ...checkBudgets(content, policy),
    ...checkSymlinks(rootDir, policy),
  ];
  return { rule: RULE, scannedTargets: 1, findings };
}
