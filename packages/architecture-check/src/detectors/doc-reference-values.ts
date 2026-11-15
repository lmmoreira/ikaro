import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Finding, ScanResult } from '../model';

const DETECTOR_CITATIONS_RULE = 'doc-detector-citations';
const SIZE_ANNOTATIONS_RULE = 'doc-size-annotations';

// Prose that names a detector without it being one: the package itself ("architecture-check
// detectors"), which sits next to the word "detector" in running text.
const NOT_A_DETECTOR_ID = new Set(['architecture-check']);

// A backticked kebab-case token, optionally followed by more of them joined by a comma, "and" or a
// slash, and then the word "detector" or "detectors": `a` detector, `a` and `b` detectors.
const ID = '`([a-z0-9]+(?:-[a-z0-9]+)+)`';
const ID_LIST_BEFORE_WORD = new RegExp(`${ID}(?:\\s*(?:,|and|/)\\s*${ID})*\\s+detectors?\\b`, 'gi');
// "detector `a`" or "detectors: `a`".
const WORD_BEFORE_ID = new RegExp(`detectors?:?\\s+${ID}`, 'gi');
const ANY_ID = /`([a-z0-9]+(?:-[a-z0-9]+)+)`/g;
const FENCE_REGEX = /^\s*(```|~~~)/;

/**
 * Every detector id a doc names must be a rule `pnpm architecture-check` really runs. A doc that
 * says "the `di-alias` detector" sends an agent to a name no CI output ever prints (M25-S33: two
 * ids in `.copilot/context.md` were the source-file names, not the rule ids). The known ids come
 * from the results the CLI has just computed, so a new or renamed detector needs no list here.
 */
export function checkDocDetectorCitations(
  root: string,
  files: readonly string[],
  knownRuleIds: ReadonlySet<string>,
): ScanResult {
  const findings: Finding[] = [];
  let scanned = 0;
  for (const file of files) {
    const absolute = resolve(root, file);
    if (!existsSync(absolute)) continue;
    scanned += 1;
    let inFence = false;
    readFileSync(absolute, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (FENCE_REGEX.test(line)) {
          inFence = !inFence;
          return;
        }
        if (inFence) return;
        for (const id of citedIds(line)) {
          if (knownRuleIds.has(id) || NOT_A_DETECTOR_ID.has(id)) continue;
          findings.push({
            rule: DETECTOR_CITATIONS_RULE,
            file,
            line: index + 1,
            message: `\`${id}\` is cited as a detector but \`pnpm architecture-check\` runs no rule with that id. Use the id the run prints ("[architecture-check] <id>: scanned N target(s)").`,
          });
        }
      });
  }
  return { rule: DETECTOR_CITATIONS_RULE, scannedTargets: scanned, findings };
}

function citedIds(line: string): Set<string> {
  const ids = new Set<string>();
  for (const match of line.matchAll(ID_LIST_BEFORE_WORD)) {
    for (const token of match[0].matchAll(ANY_ID)) ids.add(token[1]);
  }
  for (const match of line.matchAll(WORD_BEFORE_ID)) ids.add(match[1]);
  return ids;
}

const DOC_PATH_REGEX = /(?<![A-Za-z0-9_./-])((?:docs|plan|td|infra)\/[A-Za-z0-9_./-]+\.md)/g;
const SIZE_REGEX = /(?<![A-Za-z0-9])(\d+)\s*KB\b/g;
// A size annotation is a rounded figure, so a rounding step is fine; a doc that grew past this has
// drifted and the figure no longer tells an agent whether to read the doc whole.
const SIZE_TOLERANCE_RATIO = 0.08;
const SIZE_TOLERANCE_MIN_KB = 2;

/**
 * A `N KB` figure in the loading table belongs to the doc path named just before it on the same
 * line. It must stay close to the file's real size: agents use it to decide between reading a doc
 * whole and reading one section (M25-S33: 18 of the figures had drifted by up to 17 KB).
 */
export function checkDocSizeAnnotations(root: string, file: string): ScanResult {
  const absolute = resolve(root, file);
  const findings: Finding[] = [];
  let scanned = 0;
  readFileSync(absolute, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      const paths = [...line.matchAll(DOC_PATH_REGEX)].map((m) => ({
        path: m[1],
        at: m.index ?? 0,
      }));
      for (const size of line.matchAll(SIZE_REGEX)) {
        const owner = [...paths].reverse().find((p) => p.at < (size.index ?? 0));
        if (!owner) continue;
        const target = resolve(root, owner.path);
        if (!existsSync(target)) continue;
        scanned += 1;
        const claimed = Number(size[1]);
        const actual = statSync(target).size / 1024;
        const tolerance = Math.max(SIZE_TOLERANCE_MIN_KB, actual * SIZE_TOLERANCE_RATIO);
        if (Math.abs(actual - claimed) > tolerance) {
          findings.push({
            rule: SIZE_ANNOTATIONS_RULE,
            file,
            line: index + 1,
            message: `\`${owner.path}\` is annotated ${claimed} KB but is ${Math.round(actual)} KB on disk. Update the figure.`,
          });
        }
      }
    });
  return { rule: SIZE_ANNOTATIONS_RULE, scannedTargets: scanned, findings };
}
