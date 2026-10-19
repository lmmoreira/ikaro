// Shared by the `doc-orientation` detector and the `docs-for` CLI, so a CI check and an agent's
// lookup can never disagree about which doc carries which tag or which code a tag covers.
import picomatch from 'picomatch';

export interface DocTagDefinition {
  description: string;
  // Code globs the tag covers. A tag with none is a topic tag: it never marks a doc deep-checked.
  globs: string[];
}

export interface DocOrientationPolicy {
  // A header field must appear within this many lines of the top of the doc.
  headerLines: number;
  // A `When to load` line shorter than this is a placeholder, not an orientation.
  minWhenToLoadLength: number;
  tags: Record<string, DocTagDefinition>;
}

export interface DocHeaderField<T> {
  line: number;
  value: T;
}

export interface DocHeader {
  whenToLoad: DocHeaderField<string> | null;
  tags: DocHeaderField<string[]> | null;
}

export type DocKind = 'deep' | 'light';

export interface DocForEntry {
  path: string;
  tags: string[];
  kind: DocKind;
}

export interface DocsForFile {
  file: string;
  // The tags that selected docs for this file: the tags its path matches, or, for a changed doc,
  // the doc's own tags. Empty for a file no tag covers (it is also listed under `unmapped`).
  tags: string[];
}

export interface DocsForResult {
  // One entry per input file, so a reader can see which file selected which tags and docs.
  files: DocsForFile[];
  docs: DocForEntry[];
  // Changed files that no tag covers, so a reader can judge whether a doc should exist for them.
  unmapped: string[];
}

const WHEN_TO_LOAD_REGEX = /^>\s*\*\*When to load:\*\*\s*(.*)$/;
const TAGS_REGEX = /^>\s*\*\*Tags:\*\*\s*(.*)$/;
const TITLE_REGEX = /^# /;
// Every top-level docs/*.md, plus the journeys index: it is the one entry point to the prototypes,
// the other files under journeys/ are screens and per-journey specs without a header contract.
const ORIENTATION_DOC_REGEX = /^(?:docs\/[^/]+\.md|journeys\/README\.md)$/;

export function isOrientationDoc(path: string): boolean {
  return ORIENTATION_DOC_REGEX.test(path);
}

// The header sits under the `# Title` and inside the first `headerLines` lines; a field above the
// title, or in a doc whose title is outside that window, is not part of the contract.
export function parseDocHeader(content: string, headerLines: number): DocHeader {
  const header: DocHeader = { whenToLoad: null, tags: null };
  const lines = content.split('\n').slice(0, headerLines);
  const titleIndex = lines.findIndex((text) => TITLE_REGEX.test(text));
  if (titleIndex === -1) return header;
  lines.forEach((text, index) => {
    if (index <= titleIndex) return;
    const line = index + 1;
    const whenToLoad = text.match(WHEN_TO_LOAD_REGEX);
    if (whenToLoad && !header.whenToLoad) {
      header.whenToLoad = { line, value: whenToLoad[1].trim() };
      return;
    }
    const tags = text.match(TAGS_REGEX);
    if (tags && !header.tags) {
      header.tags = {
        line,
        value: tags[1]
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      };
    }
  });
  return header;
}

// The one glob matcher, so the CI detector and `docs-for` classify a path identically.
export function globMatcher(globs: string[]): (file: string) => boolean {
  return picomatch(globs, { dot: true });
}

export function tagsForFile(file: string, policy: DocOrientationPolicy): string[] {
  return Object.entries(policy.tags)
    .filter(([, definition]) => definition.globs.length > 0 && globMatcher(definition.globs)(file))
    .map(([name]) => name);
}

// A doc is deep-checked when at least one of its tags points at code, light-checked otherwise.
export function kindForTags(tags: string[], policy: DocOrientationPolicy): DocKind {
  return tags.some((tag) => (policy.tags[tag]?.globs.length ?? 0) > 0) ? 'deep' : 'light';
}

export interface DocTagIndexEntry {
  path: string;
  tags: string[];
}

function toEntries(index: DocTagIndexEntry[], policy: DocOrientationPolicy): DocForEntry[] {
  return index
    .map((doc) => ({ ...doc, kind: kindForTags(doc.tags, policy) }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function docsForTags(
  tagNames: string[],
  index: DocTagIndexEntry[],
  policy: DocOrientationPolicy,
): DocForEntry[] {
  return toEntries(
    index.filter((doc) => doc.tags.some((tag) => tagNames.includes(tag))),
    policy,
  );
}

// A changed doc is in scope itself; any other changed file reaches the docs that share a tag with
// it. A changed file that is neither a doc nor covered by a tag comes back as unmapped.
export function docsForFiles(
  files: string[],
  index: DocTagIndexEntry[],
  policy: DocOrientationPolicy,
): DocsForResult {
  const selected = new Set<string>();
  const unmapped: string[] = [];
  const perFile: DocsForFile[] = [];
  for (const file of files) {
    if (isOrientationDoc(file)) {
      const own = index.find((doc) => doc.path === file);
      if (own) selected.add(file);
      perFile.push({ file, tags: own?.tags ?? [] });
      continue;
    }
    const tags = tagsForFile(file, policy);
    perFile.push({ file, tags });
    if (tags.length === 0) {
      unmapped.push(file);
      continue;
    }
    for (const doc of index) {
      if (doc.tags.some((tag) => tags.includes(tag))) selected.add(doc.path);
    }
  }
  return {
    files: perFile,
    docs: toEntries(
      index.filter((doc) => selected.has(doc.path)),
      policy,
    ),
    unmapped: unmapped.sort(),
  };
}
