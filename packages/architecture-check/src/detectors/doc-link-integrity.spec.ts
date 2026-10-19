import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkDocLinkIntegrity, type DocLinkIntegrityPolicy } from './doc-link-integrity';

const NOW = new Date('2026-10-18T12:00:00Z');
const roots: string[] = [];

function policy(overrides: Partial<DocLinkIntegrityPolicy> = {}): DocLinkIntegrityPolicy {
  return {
    markdownSources: ['docs/', 'plan/', 'td/', 'journeys/', '.claude/commands/', '.copilot/'],
    codeSources: ['apps/', 'packages/'],
    excluded: ['docs/archive/', 'docs/discovery/', 'archive/'],
    frozen: [],
    gitignoredAllowed: [],
    allowlist: [],
    ...overrides,
  };
}

function scan(files: Record<string, string>, overrides: Partial<DocLinkIntegrityPolicy> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'doc-link-integrity-'));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return checkDocLinkIntegrity(root, policy(overrides), Object.keys(files), NOW);
}

const TARGET =
  '# Target\n\n## Transactions\n\n- **Bold lead-in**: text\n\n| Pattern | Fix |\n|---|---|\n| Cached lookup | use X |\n';

afterEach(() => {
  while (roots.length) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe('checkDocLinkIntegrity', () => {
  it('passes a fully valid set with zero findings', () => {
    const result = scan({
      'docs/TARGET.md': TARGET,
      'docs/SOURCE.md': 'See `docs/TARGET.md` § Transactions, and `docs/TARGET.md`.',
      'apps/backend/src/a.ts': '// see docs/TARGET.md\nexport {};',
    });

    expect(result.findings).toEqual([]);
    expect(result.scannedTargets).toBe(3);
  });

  it('reports a cited missing path with file and line', () => {
    const result = scan({ 'docs/SOURCE.md': 'first line\nsee `docs/MISSING.md` here' });

    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'doc-link-integrity',
        file: 'docs/SOURCE.md',
        line: 2,
        message: expect.stringContaining('docs/MISSING.md'),
      }),
    ]);
  });

  it('reports a § heading that matches no heading in its target', () => {
    const result = scan({
      'docs/TARGET.md': TARGET,
      'docs/SOURCE.md': 'See `docs/TARGET.md` § Nonexistent section.',
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toContain('Nonexistent section');
  });

  it('resolves a § citation against a heading, a bold lead-in and a table row', () => {
    const result = scan({
      'docs/TARGET.md': TARGET,
      'docs/SOURCE.md': [
        '`docs/TARGET.md` § Transactions',
        '`docs/TARGET.md` § Bold lead-in',
        '`docs/TARGET.md` § Cached lookup',
        '`docs/TARGET.md` § "Transactions"',
        '`docs/TARGET.md` § Transactions, then more prose',
      ].join('\n'),
    });

    expect(result.findings).toEqual([]);
  });

  it('reports a citation in a .ts comment to a missing doc', () => {
    const result = scan({ 'apps/backend/src/a.ts': 'export {};\n// per docs/GONE.md § Rules' });

    expect(result.findings).toEqual([
      expect.objectContaining({ file: 'apps/backend/src/a.ts', line: 2 }),
    ]);
  });

  describe('allowlist', () => {
    const entry = {
      file: 'docs/SOURCE.md',
      citation: 'docs/GONE.md',
      rationale: 'kept deliberately',
      owner: 'docs',
      reviewBy: '2026-12-31',
    };

    it('passes an allowlisted dead link', () => {
      const result = scan({ 'docs/SOURCE.md': 'see docs/GONE.md' }, { allowlist: [entry] });

      expect(result.findings).toEqual([]);
    });

    it('fails once the allowlist entry has expired', () => {
      const result = scan(
        { 'docs/SOURCE.md': 'see docs/GONE.md' },
        { allowlist: [{ ...entry, reviewBy: '2026-10-17' }] },
      );

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].message).toContain('allowlist entry expired 2026-10-17');
    });

    it('reports an allowlist entry that no longer suppresses anything', () => {
      const result = scan(
        { 'docs/SOURCE.md': 'nothing cited', 'docs/OTHER.md': '# x' },
        { allowlist: [entry] },
      );

      expect(result.findings).toEqual([
        expect.objectContaining({ message: expect.stringContaining('matches no citation') }),
      ]);
    });
  });

  describe('exemptions', () => {
    it('ignores a path inside a fenced code block but reports the same path in prose', () => {
      const result = scan({
        'docs/SOURCE.md': ['```', 'docs/FENCED.md', '```', 'docs/PROSE.md'].join('\n'),
      });

      expect(result.findings).toEqual([
        expect.objectContaining({
          line: 4,
          message: expect.stringContaining('docs/PROSE.md'),
        }),
      ]);
    });

    it('ignores a line carrying the example marker', () => {
      const result = scan({
        'docs/SOURCE.md': 'e.g. docs/NN-NAME.md <!-- doc-link:example -->\nreal docs/GONE.md',
      });

      expect(result.findings).toEqual([expect.objectContaining({ line: 2 })]);
    });

    it('skips a wildcard citation', () => {
      const result = scan({ 'docs/SOURCE.md': 'every `docs/ENGINEERING_RULES_*.md` file' });

      expect(result.findings).toEqual([]);
      expect(result.scannedTargets).toBe(0);
    });

    it('treats a slash-joined pair of docs as the first doc only', () => {
      const result = scan({
        'docs/A.md': '# A',
        'docs/SOURCE.md': 'see docs/A.md/B.md',
      });

      expect(result.findings).toEqual([]);
    });
  });

  describe('target kinds', () => {
    it('checks a trailing-slash citation as a directory', () => {
      const ok = scan({ 'docs/guides/x.md': '# x', 'docs/SOURCE.md': 'see docs/guides/' });
      const bad = scan({ 'docs/SOURCE.md': 'see docs/gone-dir/' });

      expect(ok.findings).toEqual([]);
      expect(bad.findings).toHaveLength(1);
    });

    it('checks a journeys/ citation: passes a real file and fails a dead one', () => {
      const ok = scan({
        'journeys/staff/agenda.md': '# agenda',
        'docs/SOURCE.md': 'see `journeys/staff/agenda.md`',
      });
      const bad = scan({ 'docs/SOURCE.md': 'see `journeys/staff/gone.md`' });

      expect(ok.findings).toEqual([]);
      expect(bad.findings).toEqual([
        expect.objectContaining({ message: expect.stringContaining('journeys/staff/gone.md') }),
      ]);
    });

    it('scans a journeys/ markdown file as a source', () => {
      const result = scan({ 'journeys/staff/agenda.md': 'see `docs/MISSING.md`' });

      expect(result.findings).toEqual([
        expect.objectContaining({ file: 'journeys/staff/agenda.md' }),
      ]);
    });

    it('passes a gitignored path listed in gitignoredAllowed', () => {
      const result = scan(
        { 'docs/SOURCE.md': 'see docs/BOOTSTRAP_LOG.md' },
        { gitignoredAllowed: ['docs/BOOTSTRAP_LOG.md'] },
      );

      expect(result.findings).toEqual([]);
    });

    it('trims trailing punctuation and a #fragment before the lookup', () => {
      const result = scan({
        'docs/A.md': '# A',
        'docs/SOURCE.md': 'see docs/A.md. Then docs/A.md, and docs/A.md#intro, or docs/A.md:',
      });

      expect(result.findings).toEqual([]);
    });

    it.each(['.', ',', ':', ';', ')', '#frag'])(
      'reports a missing doc cited in a .ts comment followed by "%s"',
      (suffix) => {
        const result = scan({
          'apps/backend/src/a.ts': `// see (docs/GONE.md${suffix}\nexport {};`,
        });

        expect(result.findings).toEqual([
          expect.objectContaining({ message: expect.stringContaining('docs/GONE.md') }),
        ]);
      },
    );

    it('passes a present doc cited in a .ts comment followed by sentence punctuation', () => {
      const result = scan({
        'docs/A.md': '# A',
        'apps/backend/src/a.ts': '// see docs/A.md.\n// and docs/A.md, plus docs/A.md:\nexport {};',
      });

      expect(result.findings).toEqual([]);
      expect(result.scannedTargets).toBe(3);
    });

    it('checks an infra citation against tracked files and directories', () => {
      const files = {
        'infra/terraform/README.md': '# r',
        'infra/terraform/modules/pubsub/main.tf': '',
      };
      const ok = scan({
        ...files,
        'docs/SOURCE.md':
          'see infra/terraform/README.md and infra/terraform/modules/pubsub/main.tf',
      });
      const bad = scan({ ...files, 'docs/SOURCE.md': 'see infra/terraform/modules/iam/' });

      expect(ok.findings).toEqual([]);
      expect(bad.findings).toEqual([
        expect.objectContaining({
          message: expect.stringContaining('infra/terraform/modules/iam/'),
        }),
      ]);
    });

    it('does not read prose such as infra/cost as a citation', () => {
      const result = scan({
        'infra/terraform/README.md': '# r',
        'docs/SOURCE.md': 'budget: infra/cost and infra/ops',
      });

      expect(result.findings).toEqual([]);
    });
  });

  describe('negative guarantees', () => {
    it('does not scan docs/archive, docs/discovery or archive as sources', () => {
      const result = scan({
        'docs/archive/old.md': 'see docs/GONE.md',
        'docs/discovery/idea.md': 'see docs/GONE.md',
        'archive/old.md': 'see docs/GONE.md',
      });

      expect(result.findings).toEqual([]);
      expect(result.scannedTargets).toBe(0);
    });

    it('still checks a live doc that cites a path inside an excluded folder', () => {
      const ok = scan({
        'docs/archive/old.md': '# old',
        'docs/SOURCE.md': 'history: docs/archive/old.md',
      });
      const bad = scan({ 'docs/SOURCE.md': 'history: docs/archive/missing.md' });

      expect(ok.findings).toEqual([]);
      expect(bad.findings).toHaveLength(1);
    });

    it('does not scan a file with a Frozen header or listed as frozen', () => {
      const result = scan(
        {
          'plan/M01.md': '# M01\n> Frozen: 2026-10-17\nsee docs/GONE.md',
          'plan/M02.md': '# M02\nsee docs/GONE.md',
        },
        { frozen: ['plan/M02.md'] },
      );

      expect(result.findings).toEqual([]);
      expect(result.scannedTargets).toBe(0);
    });

    it('scans a plan file that is neither frozen nor excluded', () => {
      const result = scan({ 'plan/M30.md': '# M30\nsee docs/GONE.md' });

      expect(result.findings).toHaveLength(1);
    });

    it('does not scan a .spec.ts fixture', () => {
      const result = scan({ 'apps/backend/src/a.spec.ts': "const doc = 'docs/GONE.md';" });

      expect(result.findings).toEqual([]);
      expect(result.scannedTargets).toBe(0);
    });
  });
});
