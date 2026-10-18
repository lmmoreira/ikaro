import {
  docsForFiles,
  docsForTags,
  kindForTags,
  parseDocHeader,
  tagsForFile,
  type DocOrientationPolicy,
} from './doc-tags';

const policy: DocOrientationPolicy = {
  headerLines: 15,
  minWhenToLoadLength: 20,
  tags: {
    backend: { description: 'backend', globs: ['apps/backend/**'] },
    web: { description: 'web', globs: ['apps/web/**'] },
    shared: { description: 'backend and web', globs: ['apps/backend/**', 'apps/web/**'] },
    product: { description: 'topic only', globs: [] },
  },
};

describe('parseDocHeader', () => {
  it('reads both fields and their lines', () => {
    const header = parseDocHeader(
      '# Title\n\n> **When to load:** writing a use case\n> **Tags:** backend, web\n\nBody',
      15,
    );

    expect(header.whenToLoad).toEqual({ line: 3, value: 'writing a use case' });
    expect(header.tags).toEqual({ line: 4, value: ['backend', 'web'] });
  });

  it('returns null for a missing field and ignores a field past the header window', () => {
    const body = `# Title\n${'\n'.repeat(14)}> **Tags:** backend\n`;

    expect(parseDocHeader(body, 15)).toEqual({ whenToLoad: null, tags: null });
  });

  it('ignores fields above the title and in a doc with no title in the window', () => {
    const above = '> **When to load:** writing a use case\n> **Tags:** backend\n\n# Title\n\nBody';
    const noTitle = '> **Tags:** backend\n\nBody without a title';

    expect(parseDocHeader(above, 15)).toEqual({ whenToLoad: null, tags: null });
    expect(parseDocHeader(noTitle, 15)).toEqual({ whenToLoad: null, tags: null });
  });

  it('returns an empty list for an empty Tags line', () => {
    expect(parseDocHeader('# T\n> **Tags:**\n', 15).tags).toEqual({ line: 2, value: [] });
  });
});

describe('tagsForFile', () => {
  it('maps a path to every tag whose globs match it', () => {
    expect(tagsForFile('apps/backend/src/a.ts', policy)).toEqual(['backend', 'shared']);
    expect(tagsForFile('apps/web/app/page.tsx', policy)).toEqual(['web', 'shared']);
  });

  it('maps a path no glob covers to no tag, and never maps through a glob-less tag', () => {
    expect(tagsForFile('scripts/x.sh', policy)).toEqual([]);
  });
});

describe('kindForTags', () => {
  it('is deep when any tag has globs and light otherwise', () => {
    expect(kindForTags(['product', 'backend'], policy)).toBe('deep');
    expect(kindForTags(['product'], policy)).toBe('light');
    expect(kindForTags([], policy)).toBe('light');
  });
});

describe('docsForTags and docsForFiles', () => {
  const index = [
    { path: 'docs/B.md', tags: ['backend'] },
    { path: 'docs/A.md', tags: ['web', 'product'] },
    { path: 'docs/P.md', tags: ['product'] },
  ];

  it('lists the docs carrying a tag, sorted, marked deep or light', () => {
    expect(docsForTags(['web', 'product'], index, policy)).toEqual([
      { path: 'docs/A.md', tags: ['web', 'product'], kind: 'deep' },
      { path: 'docs/P.md', tags: ['product'], kind: 'light' },
    ]);
  });

  it('selects docs through the tags of a changed file and reports an uncovered file as unmapped', () => {
    const result = docsForFiles(['apps/backend/src/a.ts', 'README.md'], index, policy);

    expect(result.docs.map((doc) => doc.path)).toEqual(['docs/B.md']);
    expect(result.unmapped).toEqual(['README.md']);
    expect(result.files).toEqual([
      { file: 'apps/backend/src/a.ts', tags: ['backend', 'shared'] },
      { file: 'README.md', tags: [] },
    ]);
  });

  it('includes a changed doc itself and does not report it as unmapped', () => {
    const result = docsForFiles(['docs/P.md'], index, policy);

    expect(result.docs.map((doc) => doc.path)).toEqual(['docs/P.md']);
    expect(result.unmapped).toEqual([]);
    expect(result.files).toEqual([{ file: 'docs/P.md', tags: ['product'] }]);
  });
});
