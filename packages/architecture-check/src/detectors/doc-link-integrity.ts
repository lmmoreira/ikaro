import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { citationResolves, cleanCitation } from '../doc-citations';
import type { Finding, ScanResult } from '../model';

export interface DocLinkAllowlistEntry {
  file: string;
  citation: string;
  rationale: string;
  owner: string;
  reviewBy: string;
}

export interface DocLinkIntegrityPolicy {
  // Path prefixes whose `.md` files are scanned for citations.
  markdownSources: string[];
  // Path prefixes whose non-spec `.ts`/`.tsx` files are scanned for `docs/…md` citations.
  codeSources: string[];
  // Path prefixes never scanned as a source (a live doc may still cite a path inside them).
  excluded: string[];
  // Exact files treated as frozen until they carry a `> Frozen: <date>` header themselves.
  frozen: string[];
  // Paths that exist locally but are gitignored, so a worktree or CI never lists them.
  gitignoredAllowed: string[];
  allowlist: DocLinkAllowlistEntry[];
}

const RULE = 'doc-link-integrity';

const EXAMPLE_MARKER = 'doc-link:example';
const FROZEN_HEADER_REGEX = /^>\s*Frozen:\s*\d{4}-\d{2}-\d{2}/m;
const FROZEN_HEADER_LINES = 15;
const FENCE_REGEX = /^\s*(```|~~~)/;
// A citation starts at one of the five doc roots, not glued to a longer path or word before it.
// The class stops at whitespace, backticks, quotes, brackets and parentheses; trailing sentence
// punctuation is trimmed afterwards.
const CITATION_REGEX =
  /(?<![A-Za-z0-9_./-])((?:docs|plan|td|journeys|infra)\/[^\s`'"<>()[\]{}|\\]*)/g;
const CODE_CITATION_REGEX = /(?<![A-Za-z0-9_./-])(docs\/[^\s`'"<>()[\]{}|\\*]*\.md)/g;
// Right after the path (and an optional closing backtick/quote/bracket) on the same line.
const SECTION_TAIL_REGEX = /^[`'")\]*]*\s*§\s*(.+)$/;
// A heading citation ends where the sentence around it continues: a list comma, a semicolon, a
// table pipe, a dash, a closing parenthesis, the end of a sentence, or a connecting word. Cutting
// early only shortens the text to match, and the match is a prefix of a real heading, so a cut
// never turns a valid citation into a failure.
const SECTION_END_REGEX =
  /\s(?:—|–|-{2})(?:\s|$)|[;,|)§–]|:\s|\.\s|\.$|\s\*?\(|\s["“]|\s(?:and|or|for|plus|with|\+)\s/;

// The 27 docs that carried a creation-order prefix until TD53 Story 6, as [number, name] pairs so
// this file never spells an old name itself. An explicit list, not an `NN-NAME` pattern: a pattern
// would also flag unrelated text such as "24-HOUR".
const RETIRED_NUMBERED_DOCS: Array<[string, string]> = [
  ['01', 'BUSINESS_CONTEXT'],
  ['02', 'DOMAIN_MODEL'],
  ['03', 'DOMAIN_EVENTS'],
  ['04', 'USE_CASES'],
  ['05', 'BOUNDED_CONTEXTS'],
  ['06', 'TENANT_ISOLATION_STRATEGY'],
  ['08', 'TESTING_STRATEGY'],
  ['09', 'CI_CD_PIPELINE'],
  ['10', 'OBSERVABILITY_STRATEGY'],
  ['11', 'ARCHITECTURE'],
  ['12', 'DEPLOYMENT_STRATEGY'],
  ['13', 'DATABASE_SCHEMA'],
  ['14', 'API_CONTRACTS'],
  ['15', 'HOTSITE_DYNAMIC_ARCHITECTURE'],
  ['16', 'DASHBOARD_FRONTEND_ARCHITECTURE'],
  ['17', 'GITHUB_WORKFLOWS_GUIDELINES'],
  ['18', 'RELEASE_LIFECYCLE_OPERATIONS'],
  ['19', 'INFRASTRUCTURE_TOOLING_MAP'],
  ['20', 'COST_OPTIMIZATION_STRATEGY'],
  ['21', 'TENANTS_SETTINGS_SCHEMA'],
  ['22', 'TECH_STACK_DECISIONS'],
  ['23', 'INFRASTRUCTURE_SETUP'],
  ['24', 'BFF_ARCHITECTURE'],
  ['25', 'ERROR_CATALOG'],
  ['26', 'DATA_RETENTION_AND_PRIVACY'],
  ['27', 'BUSINESS_LOGIC_REFERENCE'],
  ['28', 'LOCK_CATALOG'],
];
const RETIRED_NAME_BY_NUMBER = new Map(RETIRED_NUMBERED_DOCS);
// The full old name (path, bare filename or bare name) or the short `docs/NN` form.
const RETIRED_FULL_NAME_REGEX = new RegExp(
  `(?<![A-Za-z0-9_-])(${RETIRED_NUMBERED_DOCS.map(([number, name]) => `${number}-${name}`).join('|')})(?![A-Za-z0-9_])`,
  'g',
);
const RETIRED_SHORT_FORM_REGEX = new RegExp(
  `(?<![A-Za-z0-9_./-])docs/(${RETIRED_NUMBERED_DOCS.map(([number]) => number).join('|')})(?![0-9A-Za-z_-]|\\.\\d)`,
  'g',
);

interface Citation {
  path: string;
  line: number;
  tail: string;
}

interface RetiredName {
  line: number;
  text: string;
  replacement: string;
}

// A numbered doc name is gone for good, so unlike a path it needs no target lookup: any use is stale.
function findRetiredDocNames(content: string, skipFences: boolean): RetiredName[] {
  const found: RetiredName[] = [];
  let inFence = false;
  content.split('\n').forEach((text, index) => {
    if (skipFences && FENCE_REGEX.test(text)) {
      inFence = !inFence;
      return;
    }
    if (inFence || text.includes(EXAMPLE_MARKER)) return;
    for (const match of text.matchAll(RETIRED_FULL_NAME_REGEX)) {
      found.push({ line: index + 1, text: match[1], replacement: match[1].slice(3) });
    }
    for (const match of text.matchAll(RETIRED_SHORT_FORM_REGEX)) {
      found.push({
        line: index + 1,
        text: `docs/${match[1]}`,
        replacement: RETIRED_NAME_BY_NUMBER.get(match[1]) ?? match[1],
      });
    }
  });
  return found;
}

function isSpec(path: string): boolean {
  return /\.spec\.tsx?$/.test(path);
}

function startsWithAny(path: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => path.startsWith(prefix));
}

function trimPath(raw: string): string {
  // Two docs written as one slash-joined pair name two citations: only the first is a path here.
  return raw
    .split('#')[0]
    .replace(/(\.md)\/.*$/, '$1')
    .replace(/[.,;:!?*]+$/, '');
}

function extractMarkdownCitations(content: string): Citation[] {
  const citations: Citation[] = [];
  let inFence = false;
  content.split('\n').forEach((text, index) => {
    if (FENCE_REGEX.test(text)) {
      inFence = !inFence;
      return;
    }
    if (inFence || text.includes(EXAMPLE_MARKER)) return;
    CITATION_REGEX.lastIndex = 0;
    let match;
    while ((match = CITATION_REGEX.exec(text))) {
      const path = trimPath(match[1]);
      citations.push({
        path,
        line: index + 1,
        tail: text.slice(match.index + match[1].length),
      });
    }
  });
  return citations;
}

function extractCodeCitations(content: string): Citation[] {
  const citations: Citation[] = [];
  content.split('\n').forEach((text, index) => {
    if (text.includes(EXAMPLE_MARKER)) return;
    CODE_CITATION_REGEX.lastIndex = 0;
    let match;
    while ((match = CODE_CITATION_REGEX.exec(text))) {
      citations.push({
        path: match[1],
        line: index + 1,
        tail: text.slice(match.index + match[1].length),
      });
    }
  });
  return citations;
}

function sectionCitation(tail: string): string | null {
  const match = tail.match(SECTION_TAIL_REGEX);
  if (!match) return null;
  const text = match[1];
  // A quoted or backticked heading runs to its closing mark, whatever punctuation it holds.
  const quoted = text.match(/^(["'`])(.+?)\1/);
  if (quoted) return cleanCitation(quoted[2]) || null;
  const end = text.search(SECTION_END_REGEX);
  const citation = cleanCitation(end === -1 ? text : text.slice(0, end));
  return citation || null;
}

function isFrozen(path: string, content: string, policy: DocLinkIntegrityPolicy): boolean {
  if (policy.frozen.includes(path)) return true;
  return FROZEN_HEADER_REGEX.test(content.split('\n').slice(0, FROZEN_HEADER_LINES).join('\n'));
}

// Whether a cited path names something that exists. Only paths shaped like a real citation are
// judged: a `.md` file, a trailing-`/` directory, or (under infra/) any tracked file or directory.
// Returns null when the text is not a checkable citation at all (a wildcard, a bare word path).
function targetState(
  path: string,
  tracked: Set<string>,
  directories: Set<string>,
  policy: DocLinkIntegrityPolicy,
): 'exists' | 'missing' | null {
  if (path.includes('*') || path.includes('..')) return null;
  const isDirectory = path.endsWith('/');
  const bare = isDirectory ? path.slice(0, -1) : path;
  if (!bare.includes('/') && !isDirectory) return null;
  const isInfra = path.startsWith('infra/');
  // Prose uses "infra/cost" or "infra/ops" as a word. An infra citation is judged only when its
  // first directory is a real one (infra/terraform), so a removed subtree below it still fails.
  if (isInfra && bare !== 'infra' && !directories.has(bare.split('/').slice(0, 2).join('/'))) {
    return null;
  }
  if (!isDirectory && !isInfra && !path.endsWith('.md')) return null;
  if (isDirectory) return directories.has(bare) ? 'exists' : 'missing';
  if (tracked.has(path) || policy.gitignoredAllowed.includes(path)) return 'exists';
  if (isInfra && directories.has(path)) return 'exists';
  return 'missing';
}

function listDirectories(files: string[]): Set<string> {
  const directories = new Set<string>();
  for (const file of files) {
    let index = file.indexOf('/');
    while (index !== -1) {
      directories.add(file.slice(0, index));
      index = file.indexOf('/', index + 1);
    }
  }
  return directories;
}

// `files` is every repository file that exists (git ls-files plus untracked, minus ignored), so a
// citation is judged against the live tree, not against a catalog that has to be kept in sync.
export function checkDocLinkIntegrity(
  rootDir: string,
  policy: DocLinkIntegrityPolicy,
  files: string[],
  now: Date = new Date(),
): ScanResult {
  const findings: Finding[] = [];
  const tracked = new Set(files);
  const directories = listDirectories(files);
  const today = now.toISOString().slice(0, 10);
  const matchedAllowlist = new Set<DocLinkAllowlistEntry>();
  let scannedTargets = 0;

  for (const file of files) {
    if (startsWithAny(file, policy.excluded)) continue;
    const isMarkdown = file.endsWith('.md') && startsWithAny(file, policy.markdownSources);
    const isCode = /\.tsx?$/.test(file) && !isSpec(file) && startsWithAny(file, policy.codeSources);
    if (!isMarkdown && !isCode) continue;
    const absolutePath = resolve(rootDir, file);
    if (!existsSync(absolutePath)) continue;
    const content = readFileSync(absolutePath, 'utf8');
    // Checked before the frozen skip: the rename rewrote frozen files too.
    for (const retired of findRetiredDocNames(content, isMarkdown)) {
      findings.push({
        rule: RULE,
        file,
        line: retired.line,
        message: `Retired numbered doc name "${retired.text}": the numeric prefix was dropped, cite docs/${retired.replacement}.md.`,
      });
    }
    if (isMarkdown && isFrozen(file, content, policy)) continue;

    const citations = isMarkdown
      ? extractMarkdownCitations(content)
      : extractCodeCitations(content);
    for (const citation of citations) {
      const state = targetState(citation.path, tracked, directories, policy);
      if (state === null) continue;
      scannedTargets++;
      const allowed = policy.allowlist.find(
        (entry) => entry.file === file && entry.citation === citation.path,
      );

      let message: string | null = null;
      if (state === 'missing') {
        message = `Cited path does not exist: ${citation.path}`;
      } else if (citation.path.endsWith('.md')) {
        const heading = sectionCitation(citation.tail);
        if (heading && tracked.has(citation.path)) {
          const target = resolve(rootDir, citation.path);
          if (existsSync(target) && !citationResolves(readFileSync(target, 'utf8'), heading)) {
            message = `§ heading does not resolve in ${citation.path}: "${heading}" matches no heading, bold-lead-in bullet, or table row there.`;
          }
        }
      }
      if (message === null) continue;
      if (allowed) matchedAllowlist.add(allowed);
      if (allowed && allowed.reviewBy >= today) continue;
      findings.push({
        rule: RULE,
        file,
        line: citation.line,
        message: allowed
          ? `${message} (allowlist entry expired ${allowed.reviewBy} — fix the citation or renew the entry with a new reviewBy)`
          : message,
      });
    }
  }

  for (const entry of policy.allowlist) {
    if (matchedAllowlist.has(entry)) continue;
    findings.push({
      rule: RULE,
      file: 'packages/architecture-check/architecture-policy.json',
      line: 1,
      message: `Allowlist entry for ${entry.citation} in ${entry.file} matches no citation — remove it.`,
    });
  }
  return { rule: RULE, scannedTargets, findings };
}
