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

export interface DocsForResult {
  docs: DocForEntry[];
  // Changed files that no tag covers, so a reader can judge whether a doc should exist for them.
  unmapped: string[];
}

const WHEN_TO_LOAD_REGEX = /^>\s*\*\*When to load:\*\*\s*(.*)$/;
const TAGS_REGEX = /^>\s*\*\*Tags:\*\*\s*(.*)$/;
const TOP_LEVEL_DOC_REGEX = /^docs\/[^/]+\.md$/;

export function isOrientationDoc(path: string): boolean {
  return TOP_LEVEL_DOC_REGEX.test(path);
}

export function parseDocHeader(content: string, headerLines: number): DocHeader {
  const header: DocHeader = { whenToLoad: null, tags: null };
  content
    .split('\n')
    .slice(0, headerLines)
    .forEach((text, index) => {
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

function matcher(globs: string[]): (file: string) => boolean {
  return picomatch(globs, { dot: true });
}

export function tagsForFile(file: string, policy: DocOrientationPolicy): string[] {
  return Object.entries(policy.tags)
    .filter(([, definition]) => definition.globs.length > 0 && matcher(definition.globs)(file))
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
  for (const file of files) {
    if (isOrientationDoc(file)) {
      if (index.some((doc) => doc.path === file)) selected.add(file);
      continue;
    }
    const tags = tagsForFile(file, policy);
    if (tags.length === 0) {
      unmapped.push(file);
      continue;
    }
    for (const doc of index) {
      if (doc.tags.some((tag) => tags.includes(tag))) selected.add(doc.path);
    }
  }
  return {
    docs: toEntries(
      index.filter((doc) => selected.has(doc.path)),
      policy,
    ),
    unmapped: unmapped.sort(),
  };
}
