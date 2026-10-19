import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runDocsFor } from './docs-for';

const roots: string[] = [];

const POLICY = {
  docOrientation: {
    headerLines: 15,
    minWhenToLoadLength: 20,
    tags: {
      backend: { description: 'backend', globs: ['apps/backend/**'] },
      product: { description: 'topic only', globs: [] },
      prototypes: { description: 'journeys', globs: ['journeys/**'] },
    },
  },
};

function doc(tags: string): string {
  return `# D\n> **When to load:** writing a backend use case or a repository\n> **Tags:** ${tags}\n`;
}

function git(root: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: root });
}

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'docs-for-'));
  roots.push(root);
  const files: Record<string, string> = {
    'packages/architecture-check/architecture-policy.json': JSON.stringify(POLICY),
    'docs/BACKEND.md': doc('backend'),
    'docs/PRODUCT.md': doc('product'),
    'journeys/README.md': doc('prototypes'),
    'apps/backend/src/a.ts': 'export {};',
    'scripts/x.sh': '#!/bin/sh',
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  return root;
}

function run(root: string, ...argv: string[]) {
  let out = '';
  let err = '';
  const code = runDocsFor(argv, root, {
    stdout: (text) => (out += text),
    stderr: (text) => (err += text),
  });
  return { code, out, err };
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe('runDocsFor', () => {
  it('--file lists the docs sharing a tag with the file, marked deep or light', () => {
    const { code, out } = run(repo(), '--file', 'apps/backend/src/a.ts');

    expect(code).toBe(0);
    expect(out).toBe('tags apps/backend/src/a.ts [backend]\ndeep docs/BACKEND.md [backend]\n');
  });

  it('--file keeps each input file separate when several select the same doc', () => {
    const { out, code } = run(repo(), '--file', 'apps/backend/src/a.ts', 'apps/backend/src/b.ts');

    expect(code).toBe(0);
    expect(out).toBe(
      'tags apps/backend/src/a.ts [backend]\ntags apps/backend/src/b.ts [backend]\ndeep docs/BACKEND.md [backend]\n',
    );
  });

  it('--file --json carries the per-file tags next to docs and unmapped', () => {
    const { out } = run(repo(), '--file', 'apps/backend/src/a.ts', 'scripts/x.sh', '--json');

    expect(JSON.parse(out)).toEqual({
      files: [
        { file: 'apps/backend/src/a.ts', tags: ['backend'] },
        { file: 'scripts/x.sh', tags: [] },
      ],
      docs: [{ path: 'docs/BACKEND.md', tags: ['backend'], kind: 'deep' }],
      unmapped: ['scripts/x.sh'],
    });
  });

  it('--file lists a file no tag covers as unmapped', () => {
    const { out } = run(repo(), '--file', 'scripts/x.sh');

    expect(out).toBe('unmapped scripts/x.sh\n');
  });

  it('--range maps every file changed in a git range', () => {
    const root = repo();
    writeFileSync(join(root, 'apps/backend/src/a.ts'), 'export const a = 1;');
    writeFileSync(join(root, 'scripts/x.sh'), '#!/bin/sh\necho');
    git(root, 'commit', '-q', '-am', 'change');

    const { code, out } = run(root, '--range', 'HEAD~1..HEAD');

    expect(code).toBe(0);
    expect(out).toBe(
      'tags apps/backend/src/a.ts [backend]\ndeep docs/BACKEND.md [backend]\nunmapped scripts/x.sh\n',
    );
  });

  it('--tag lists the docs carrying a tag', () => {
    expect(run(repo(), '--tag', 'product').out).toBe('light docs/PRODUCT.md [product]\n');
  });

  it('--tag lists the journeys index, and a changed prototype file selects it', () => {
    expect(run(repo(), '--tag', 'prototypes').out).toBe('deep journeys/README.md [prototypes]\n');
    expect(run(repo(), '--file', 'journeys/staff/prototypes/a/01.html').out).toContain(
      'deep journeys/README.md [prototypes]',
    );
  });

  it('--json returns the same data as structured output', () => {
    const { out } = run(repo(), '--tag', 'backend', '--json');

    expect(JSON.parse(out)).toEqual({
      files: [],
      docs: [{ path: 'docs/BACKEND.md', tags: ['backend'], kind: 'deep' }],
      unmapped: [],
    });
  });

  it('exits non-zero on an unknown tag and on bad usage', () => {
    const root = repo();

    expect(run(root, '--tag', 'nope')).toEqual(
      expect.objectContaining({ code: 2, err: expect.stringContaining('Unknown tag nope') }),
    );
    expect(run(root).code).toBe(2);
    expect(run(root, '--range', 'a..b', 'c..d').code).toBe(2);
  });
});
