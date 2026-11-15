import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkDocDetectorCitations, checkDocSizeAnnotations } from './doc-reference-values';

const roots: string[] = [];

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'doc-reference-values-'));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe('checkDocDetectorCitations', () => {
  const known = new Set(['unsafe-use-existing', 'reverse-di-alias', 'doc-link-integrity']);

  function scan(content: string) {
    const root = tree({ 'docs/A.md': content });
    return checkDocDetectorCitations(root, ['docs/A.md'], known);
  }

  it('passes a doc that cites only real rule ids', () => {
    const result = scan('Fails the `unsafe-use-existing` and `reverse-di-alias` detectors.\n');

    expect(result.findings).toEqual([]);
    expect(result.scannedTargets).toBe(1);
  });

  it('reports an id followed by the word detector that no rule runs', () => {
    const result = scan('line one\n**CI-enforced**: `di-alias` detector\n');

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      rule: 'doc-detector-citations',
      file: 'docs/A.md',
      line: 2,
    });
    expect(result.findings[0].message).toContain('`di-alias`');
  });

  it('reports a wrong id inside a list of ids before the word detectors', () => {
    const result = scan('The `unsafe-use-existing`, `old-name` detectors catch it.\n');

    expect(result.findings.map((f) => f.message)).toEqual([expect.stringContaining('`old-name`')]);
  });

  it('reports a wrong id written after the word detector', () => {
    const result = scan('See the detector `vo-bare-error` for details.\n');

    expect(result.findings).toHaveLength(1);
  });

  it('does not flag the package name used in running text', () => {
    const result = scan('The `architecture-check` detectors run on every PR.\n');

    expect(result.findings).toEqual([]);
  });

  it('ignores a kebab token that is not next to the word detector', () => {
    const result = scan('Run `pr-land` then `pre-pr`.\n');

    expect(result.findings).toEqual([]);
  });

  it('ignores a fenced code block', () => {
    const result = scan('```\n`di-alias` detector\n```\n');

    expect(result.findings).toEqual([]);
  });

  it('skips a file that does not exist without counting it', () => {
    const root = tree({});

    const result = checkDocDetectorCitations(root, ['docs/MISSING.md'], known);

    expect(result.scannedTargets).toBe(0);
  });
});

describe('checkDocSizeAnnotations', () => {
  const KB = 'x'.repeat(1024);

  function scan(context: string, docs: Record<string, number>) {
    const files: Record<string, string> = { '.copilot/context.md': context };
    for (const [path, kb] of Object.entries(docs)) files[path] = KB.repeat(kb);
    return checkDocSizeAnnotations(tree(files), '.copilot/context.md');
  }

  it('passes a figure that matches the file', () => {
    const result = scan('| row | `docs/A.md` (50 KB) |\n', { 'docs/A.md': 50 });

    expect(result.findings).toEqual([]);
    expect(result.scannedTargets).toBe(1);
  });

  it('allows a small rounding difference', () => {
    const result = scan('| row | `docs/A.md` (50 KB) |\n', { 'docs/A.md': 52 });

    expect(result.findings).toEqual([]);
  });

  it('reports a figure that has drifted', () => {
    const result = scan('| row | `docs/A.md` (50 KB) |\n', { 'docs/A.md': 70 });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ rule: 'doc-size-annotations', line: 1 });
    expect(result.findings[0].message).toContain('50 KB');
    expect(result.findings[0].message).toContain('70 KB');
  });

  it('attributes a figure to the nearest path before it on the line', () => {
    const result = scan('| `docs/A.md` (10 KB) + `docs/B.md` (60 KB) |\n', {
      'docs/A.md': 10,
      'docs/B.md': 60,
    });

    expect(result.findings).toEqual([]);
    expect(result.scannedTargets).toBe(2);
  });

  it('ignores a figure with no doc path before it, and a path that does not exist', () => {
    const result = scan('a 40 KB note\n`docs/GONE.md` (30 KB)\n', {});

    expect(result.findings).toEqual([]);
    expect(result.scannedTargets).toBe(0);
  });
});
