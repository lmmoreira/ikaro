import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  globMatcher,
  isOrientationDoc,
  parseDocHeader,
  type DocOrientationPolicy,
  type DocTagDefinition,
} from '../doc-tags';
import type { Finding, ScanResult } from '../model';

export type { DocOrientationPolicy, DocTagDefinition };

const RULE = 'doc-orientation';
const POLICY_FILE = 'packages/architecture-check/architecture-policy.json';

const README_FILE = 'docs/README.md';
const README_LIST_HEADING = '## Reading order';
const README_DOC_NAME_REGEX = /`([A-Z][A-Z0-9_]*\.md)`/g;

// `docs/README.md`'s "Reading order" section names every top-level doc once the numeric prefixes
// are gone, so the list is the only place the original order survives. It must not drift from the
// folder: a doc missing from it is invisible to a reader, a listed name with no file is a dead pointer.
function checkReadmeListsEveryDoc(rootDir: string, files: string[]): Finding[] {
  if (!files.includes(README_FILE) || !existsSync(resolve(rootDir, README_FILE))) return [];
  const lines = readFileSync(resolve(rootDir, README_FILE), 'utf8').split('\n');
  const start = lines.findIndex((line) => line.trim() === README_LIST_HEADING);
  const report = (line: number, message: string): Finding => ({
    rule: RULE,
    file: README_FILE,
    line,
    message,
  });
  if (start === -1) {
    return [report(1, `No "${README_LIST_HEADING}" section: the list of every doc lives there.`)];
  }
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const listed = new Map<string, number>();
  lines.slice(start, end === -1 ? undefined : end).forEach((text, offset) => {
    for (const match of text.matchAll(README_DOC_NAME_REGEX)) {
      if (!listed.has(match[1])) listed.set(match[1], start + offset + 1);
    }
  });

  const existing = new Set(
    files
      .filter((file) => /^docs\/[^/]+\.md$/.test(file) && file !== README_FILE)
      .map((file) => file.slice('docs/'.length)),
  );
  const findings: Finding[] = [];
  for (const [name, line] of listed) {
    if (!existing.has(name)) {
      findings.push(report(line, `"${name}" is listed but docs/${name} does not exist.`));
    }
  }
  for (const name of [...existing].sort()) {
    if (!listed.has(name)) {
      findings.push(
        report(start + 1, `docs/${name} is missing from the "${README_LIST_HEADING}" list.`),
      );
    }
  }
  return findings;
}

// Every top-level docs/*.md (and journeys/README.md) opens with a `When to load` line and a `Tags` line, so an agent can
// decide from the first lines whether to read on, and `docs-for` can map changed code to docs.
// `files` is every repository file that exists, so a tag's globs are judged against the live tree.
export function checkDocOrientation(
  rootDir: string,
  policy: DocOrientationPolicy,
  files: string[],
): ScanResult {
  const findings: Finding[] = [];
  const usedTags = new Set<string>();
  let scannedTargets = 0;

  for (const file of files) {
    if (!isOrientationDoc(file)) continue;
    const absolutePath = resolve(rootDir, file);
    if (!existsSync(absolutePath)) continue;
    scannedTargets++;
    const header = parseDocHeader(readFileSync(absolutePath, 'utf8'), policy.headerLines);
    const report = (message: string) => findings.push({ rule: RULE, file, line: 1, message });

    if (!header.whenToLoad) {
      report(
        `No "> **When to load:** …" line under the "# Title", within the first ${policy.headerLines} lines. State when this doc applies, which apps/layers/contexts it covers, and which neighbouring doc holds what it does not.`,
      );
    } else if (header.whenToLoad.value.length < policy.minWhenToLoadLength) {
      findings.push({
        rule: RULE,
        file,
        line: header.whenToLoad.line,
        message: `"When to load" is ${header.whenToLoad.value.length} characters; write at least ${policy.minWhenToLoadLength} so it states a real trigger, not a placeholder.`,
      });
    }

    if (!header.tags) {
      report(
        `No "> **Tags:** a, b" line under the "# Title", within the first ${policy.headerLines} lines. Pick one or more from the vocabulary in ${POLICY_FILE} (docOrientation.tags).`,
      );
    } else if (header.tags.value.length === 0) {
      findings.push({
        rule: RULE,
        file,
        line: header.tags.line,
        message: 'The Tags line is empty; give the doc at least one tag from the vocabulary.',
      });
    } else {
      for (const tag of header.tags.value) {
        usedTags.add(tag);
        if (policy.tags[tag]) continue;
        findings.push({
          rule: RULE,
          file,
          line: header.tags.line,
          message: `Unknown tag "${tag}". Known tags: ${Object.keys(policy.tags).join(', ')}.`,
        });
      }
    }
  }

  findings.push(...checkReadmeListsEveryDoc(rootDir, files));

  for (const [name, definition] of Object.entries(policy.tags)) {
    if (!usedTags.has(name)) {
      findings.push({
        rule: RULE,
        file: POLICY_FILE,
        line: 1,
        message: `Tag "${name}" is in the vocabulary but no doc uses it. Remove it or tag a doc with it.`,
      });
    }
    if (definition.globs.length === 0) continue;
    const matchesTag = globMatcher(definition.globs);
    if (!files.some((file) => matchesTag(file))) {
      findings.push({
        rule: RULE,
        file: POLICY_FILE,
        line: 1,
        message: `Tag "${name}" has globs (${definition.globs.join(', ')}) that match no file. Update them to the code's current location.`,
      });
    }
  }
  return { rule: RULE, scannedTargets, findings };
}
