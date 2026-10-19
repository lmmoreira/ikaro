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
