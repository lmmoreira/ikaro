import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkDocOrientation, type DocOrientationPolicy } from './doc-orientation';

const roots: string[] = [];

const policy: DocOrientationPolicy = {
  headerLines: 15,
  minWhenToLoadLength: 20,
  tags: {
    backend: { description: 'backend', globs: ['apps/backend/**'] },
    product: { description: 'topic only', globs: [] },
  },
};

const WHEN = '> **When to load:** writing a backend use case or a repository\n';
const GOOD = `# Doc\n\n${WHEN}> **Tags:** backend, product\n\nBody\n`;
const CODE = { 'apps/backend/src/a.ts': 'export {};' };

function scan(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'doc-orientation-'));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return checkDocOrientation(root, policy, Object.keys(files));
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe('checkDocOrientation', () => {
  it('passes a doc with both fields in the first 15 lines', () => {
    const result = scan({ 'docs/A.md': GOOD, ...CODE });

    expect(result.findings).toEqual([]);
    expect(result.scannedTargets).toBe(1);
  });

  it('reports a missing When to load line', () => {
    const result = scan({ 'docs/A.md': '# Doc\n> **Tags:** backend, product\n', ...CODE });

    expect(result.findings).toEqual([
      expect.objectContaining({
        file: 'docs/A.md',
        message: expect.stringContaining('When to load'),
      }),
    ]);
  });

  it('reports a When to load line shorter than the minimum', () => {
    const result = scan({
      'docs/A.md': '# Doc\n> **When to load:** TBD\n> **Tags:** backend, product\n',
      ...CODE,
    });

    expect(result.findings).toEqual([
      expect.objectContaining({ line: 2, message: expect.stringContaining('at least 20') }),
    ]);
  });

  it('reports a missing Tags line, an empty one and an unknown tag', () => {
    const result = scan({
      'docs/NONE.md': `# D\n${WHEN}`,
      'docs/EMPTY.md': `# D\n${WHEN}> **Tags:**\n`,
      'docs/UNKNOWN.md': `# D\n${WHEN}> **Tags:** backend, product, wat\n`,
      ...CODE,
    });

    expect(result.findings.map((finding) => finding.file)).toEqual([
      'docs/NONE.md',
      'docs/EMPTY.md',
      'docs/UNKNOWN.md',
    ]);
    expect(result.findings[2].message).toContain('Unknown tag "wat"');
  });

  it('passes a field on line 15 and reports one on line 16', () => {
    const onLine15 = `# D\n${'\n'.repeat(12)}${WHEN}> **Tags:** backend, product\n`;
    const onLine16 = `# D\n${'\n'.repeat(13)}${WHEN}> **Tags:** backend, product\n`;

    expect(scan({ 'docs/A.md': onLine15, ...CODE }).findings).toEqual([]);
    const docFindings = scan({ 'docs/A.md': onLine16, ...CODE }).findings.filter(
      (finding) => finding.file === 'docs/A.md',
    );
    expect(docFindings).toEqual([
      expect.objectContaining({ message: expect.stringContaining('Tags') }),
    ]);
  });

  it('reports fields placed above the title', () => {
    const above = `${WHEN}> **Tags:** backend, product\n\n# Doc\n\nBody\n`;
    const docFindings = scan({ 'docs/A.md': above, ...CODE }).findings.filter(
      (finding) => finding.file === 'docs/A.md',
    );

    expect(docFindings.map((finding) => finding.message)).toEqual([
      expect.stringContaining('When to load'),
      expect.stringContaining('Tags'),
    ]);
  });

  it('reports a vocabulary tag no doc uses, but not a glob-less tag that is used', () => {
    const result = scan({ 'docs/A.md': `# D\n${WHEN}> **Tags:** product\n`, ...CODE });

    expect(result.findings).toEqual([
      expect.objectContaining({ message: expect.stringContaining('Tag "backend"') }),
    ]);
  });

  it('reports a tag whose globs match no file, and passes one that matches', () => {
    const missing = scan({ 'docs/A.md': GOOD });
    const present = scan({ 'docs/A.md': GOOD, ...CODE });

    expect(missing.findings).toEqual([
      expect.objectContaining({ message: expect.stringContaining('match no file') }),
    ]);
    expect(present.findings).toEqual([]);
  });

  it('does not scan docs outside the top level of docs/', () => {
    const result = scan({
      'docs/A.md': GOOD,
      'archive/OLD.md': '# Old\nno header',
      'docs/discovery/X/MAIN.md': '# Discovery\nno header',
      'plan/M01.md': '# Plan\nno header',
      ...CODE,
    });

    expect(result.findings).toEqual([]);
    expect(result.scannedTargets).toBe(1);
  });

  describe('docs/README.md reading order', () => {
    const readme = (items: string) =>
      `# Docs\n\n${WHEN}> **Tags:** backend, product\n\n## Where a new doc goes\n\nSee \`UPPER_SNAKE.md\`.\n\n## Reading order\n\n${items}\n\n## Other\n\nSee \`EXTRA.md\`.\n`;

    it('passes when the list names exactly the top-level docs', () => {
      const result = scan({
        'docs/README.md': readme('1. `A.md`: first.\n- **Group:** `B.md`.'),
        'docs/A.md': GOOD,
        'docs/B.md': GOOD,
        ...CODE,
      });

      expect(result.findings).toEqual([]);
    });

    it('reports a doc missing from the list', () => {
      const result = scan({
        'docs/README.md': readme('1. `A.md`: first.'),
        'docs/A.md': GOOD,
        'docs/B.md': GOOD,
        ...CODE,
      });

      expect(result.findings).toEqual([
        expect.objectContaining({
          file: 'docs/README.md',
          message: expect.stringContaining('docs/B.md is missing'),
        }),
      ]);
    });

    it('reports a listed name that has no file', () => {
      const result = scan({
        'docs/README.md': readme('1. `A.md`: first.\n2. `GONE.md`: removed.'),
        'docs/A.md': GOOD,
        ...CODE,
      });

      expect(result.findings).toEqual([
        expect.objectContaining({
          line: 13,
          message: expect.stringContaining('docs/GONE.md does not exist'),
        }),
      ]);
    });

    it('reads only the Reading order section, not names mentioned elsewhere in the README', () => {
      const result = scan({
        'docs/README.md': readme('1. `A.md`: first.'),
        'docs/A.md': GOOD,
        ...CODE,
      });

      expect(result.findings).toEqual([]);
    });

    it('reports a README with no Reading order section', () => {
      const result = scan({
        'docs/README.md': `# Docs\n\n${WHEN}> **Tags:** backend, product\n\nBody\n`,
        ...CODE,
      });

      expect(result.findings).toEqual([
        expect.objectContaining({ message: expect.stringContaining('No "## Reading order"') }),
      ]);
    });
  });
});
