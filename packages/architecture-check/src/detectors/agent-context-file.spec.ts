import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAgentContextFile, type AgentContextPolicy } from './agent-context-file';

function basePolicy(overrides: Partial<AgentContextPolicy> = {}): AgentContextPolicy {
  return {
    targetFile: '.copilot/context.md',
    symlinks: [
      { path: 'CLAUDE.md', expectedTarget: '.copilot/context.md' },
      { path: 'AGENTS.md', expectedTarget: '.copilot/context.md' },
      { path: 'gemini.md', expectedTarget: '.copilot/context.md' },
    ],
    requiredAnchors: ['PR GATE', 'Stuck conditions'],
    forbiddenPatterns: ['PR #\\d+', '\\b(19|20)\\d{2}-\\d{2}-\\d{2}\\b'],
    forbiddenPatternAllowlist: [
      { text: '2026-01-01', rationale: 'test fixture', owner: 'test', reviewBy: '2027-01-01' },
    ],
    budgets: {
      file: { maxLines: 100, maxChars: 5000 },
      sections: { '7': { maxLines: 20, maxChars: 1000 } },
    },
    ...overrides,
  };
}

function buildRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'agent-context-file-'));
  mkdirSync(join(root, '.copilot'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    writeFileSync(join(root, path), content);
  }
  return root;
}

function symlinkAll(root: string) {
  symlinkSync(join(root, '.copilot/context.md'), join(root, 'CLAUDE.md'));
  symlinkSync(join(root, '.copilot/context.md'), join(root, 'AGENTS.md'));
  symlinkSync(join(root, '.copilot/context.md'), join(root, 'gemini.md'));
}

const validContext = `## 7. Engineering Rules

- **PR GATE** stays verbatim.
- **Stuck conditions** stays verbatim.
- pointer to a heading → \`docs/ENGINEERING_RULES.md\` § Transactions
- pointer to a bold bullet → \`docs/ANTI_PATTERNS.md\` § Some Anti Pattern
`;

const engineeringRulesFixture = `## Transactions

Some real content here.
`;

const antiPatternsFixture = `# Anti-Patterns

| Pattern | Problem | Fix |
|---|---|---|
| Some Anti Pattern happens when code is wrong | It breaks things | Fix it properly |
`;

describe('checkAgentContextFile', () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('passes on a fully valid file: required anchors present, pointers resolve (heading + table-row styles), symlinks intact', () => {
    root = buildRoot({
      '.copilot/context.md': validContext,
      'docs/ENGINEERING_RULES.md': engineeringRulesFixture,
      'docs/ANTI_PATTERNS.md': antiPatternsFixture,
    });
    symlinkAll(root);
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.scannedTargets).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it('flags a missing required anchor', () => {
    root = buildRoot({
      '.copilot/context.md': '## 7. Engineering Rules\n\nNo gates mentioned here at all.\n',
      'docs/ENGINEERING_RULES.md': engineeringRulesFixture,
      'docs/ANTI_PATTERNS.md': antiPatternsFixture,
    });
    symlinkAll(root);
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('PR GATE') }),
        expect.objectContaining({ message: expect.stringContaining('Stuck conditions') }),
      ]),
    );
  });

  it('flags a pointer to a file that does not exist', () => {
    root = buildRoot({
      '.copilot/context.md':
        '## 7. Engineering Rules\n\n- **PR GATE** and **Stuck conditions**.\n- broken → `docs/DOES_NOT_EXIST.md` § Anything\n',
    });
    symlinkAll(root);
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('docs/DOES_NOT_EXIST.md') }),
      ]),
    );
  });

  it('flags a pointer whose § heading does not resolve in an existing target file', () => {
    root = buildRoot({
      '.copilot/context.md':
        '## 7. Engineering Rules\n\n- **PR GATE** and **Stuck conditions**.\n- broken → `docs/ENGINEERING_RULES.md` § A Heading That Does Not Exist\n',
      'docs/ENGINEERING_RULES.md': engineeringRulesFixture,
    });
    symlinkAll(root);
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('A Heading That Does Not Exist'),
        }),
      ]),
    );
  });

  it('resolves a pointer whose target is a bold-lead-in bullet, not a markdown heading', () => {
    const boldBulletTarget = `## Some Section

- **Implicit vs. explicit CSS defaults:** the real rule text goes here.
`;
    root = buildRoot({
      '.copilot/context.md':
        '## 7. Engineering Rules\n\n- **PR GATE** and **Stuck conditions**.\n- pointer → `docs/BOLD_BULLET.md` § Implicit vs. explicit CSS defaults\n',
      'docs/BOLD_BULLET.md': boldBulletTarget,
    });
    symlinkAll(root);
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings).toHaveLength(0);
  });

  it('rejects a word-boundary-violating citation match (e.g. "eal" inside "Real Heading")', () => {
    root = buildRoot({
      '.copilot/context.md':
        '## 7. Engineering Rules\n\n- **PR GATE** and **Stuck conditions**.\n- bad → `docs/REAL.md` § eal\n',
      'docs/REAL.md': '## Real Heading\n\nContent.\n',
    });
    symlinkAll(root);
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('"eal"') }),
      ]),
    );
  });

  it('rejects a word-boundary-violating citation match (e.g. "a" inside "An existing section")', () => {
    root = buildRoot({
      '.copilot/context.md':
        '## 7. Engineering Rules\n\n- **PR GATE** and **Stuck conditions**.\n- bad → `docs/AN.md` § a\n',
      'docs/AN.md': '## An existing section\n\nContent.\n',
    });
    symlinkAll(root);
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('"a"') }),
      ]),
    );
  });

  it('flags a pointer path that escapes its own root via traversal', () => {
    root = buildRoot({
      '.copilot/context.md':
        '## 7. Engineering Rules\n\n- **PR GATE** and **Stuck conditions**.\n- bad → `docs/../../../etc/passwd` § Anything\n',
    });
    symlinkAll(root);
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('escapes its own root') }),
      ]),
    );
  });

  it('fails closed on a numbered section with no budget entry, instead of silently skipping it', () => {
    root = buildRoot({
      '.copilot/context.md':
        '## 7. Engineering Rules\n\n- **PR GATE** and **Stuck conditions**.\n\n## 18. Unbudgeted New Section\n\nLots of content that could grow unbounded.\n',
    });
    symlinkAll(root);
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('§18 has no budget entry') }),
      ]),
    );
  });

  it('still catches a forbidden pattern smuggled onto the same line as the Last-updated stamp', () => {
    root = buildRoot({
      '.copilot/context.md':
        '**Last updated:** 2026-01-01 (see PR #4821)\n\n## 7. Engineering Rules\n\n- **PR GATE** and **Stuck conditions**.\n',
    });
    symlinkAll(root);
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('PR #4821') }),
      ]),
    );
  });

  it('still exempts a clean, date-only Last-updated line', () => {
    root = buildRoot({
      '.copilot/context.md':
        '**Last updated:** 2026-05-05\n\n## 7. Engineering Rules\n\n- **PR GATE** and **Stuck conditions**.\n',
    });
    symlinkAll(root);
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings.filter((f) => f.message.includes('2026-05-05'))).toHaveLength(0);
  });

  it('flags a bare PR number literal', () => {
    root = buildRoot({
      '.copilot/context.md':
        '## 7. Engineering Rules\n\n- **PR GATE** and **Stuck conditions**.\n- fixed in PR #4821, see the diff.\n',
    });
    symlinkAll(root);
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('PR #4821') }),
      ]),
    );
  });

  it('flags a non-allowlisted ISO date', () => {
    root = buildRoot({
      '.copilot/context.md':
        '## 7. Engineering Rules\n\n- **PR GATE** and **Stuck conditions**.\n- decided 2026-05-05 per some story.\n',
    });
    symlinkAll(root);
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('2026-05-05') }),
      ]),
    );
  });

  it('accepts an allowlisted ISO date', () => {
    root = buildRoot({
      '.copilot/context.md':
        '## 7. Engineering Rules\n\n- **PR GATE** and **Stuck conditions**.\n- decided 2026-01-01 per the allowlist fixture.\n',
    });
    symlinkAll(root);
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings).toHaveLength(0);
  });

  it('flags a file-wide budget overrun', () => {
    const longLine = 'x'.repeat(6000);
    root = buildRoot({
      '.copilot/context.md': `## 7. Engineering Rules\n\n- **PR GATE** and **Stuck conditions**.\n${longLine}\n`,
    });
    symlinkAll(root);
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('File exceeds its budget') }),
      ]),
    );
  });

  it('flags a per-section budget overrun', () => {
    const manyLines = Array.from({ length: 30 }, (_, i) => `- line ${i}`).join('\n');
    root = buildRoot({
      '.copilot/context.md': `## 7. Engineering Rules\n\n- **PR GATE** and **Stuck conditions**.\n${manyLines}\n`,
    });
    symlinkAll(root);
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('§7 exceeds its budget') }),
      ]),
    );
  });

  it('reports scannedTargets = 1 when the file exists', () => {
    root = buildRoot({ '.copilot/context.md': validContext });
    symlinkAll(root);
    expect(checkAgentContextFile(root, basePolicy()).scannedTargets).toBe(1);
  });

  it('reports zero targets when the file is absent (triggers the CLI zero-target guard)', () => {
    root = mkdtempSync(join(tmpdir(), 'agent-context-file-'));
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.scannedTargets).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it('passes when all three symlinks are intact', () => {
    root = buildRoot({ '.copilot/context.md': validContext });
    symlinkAll(root);
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings.filter((f) => f.message.includes('symlink'))).toHaveLength(0);
  });

  it('flags a symlink replaced with a divergent real file', () => {
    root = buildRoot({
      '.copilot/context.md': validContext,
      'AGENTS.md': '# a real file, not a symlink',
    });
    symlinkSync(join(root, '.copilot/context.md'), join(root, 'CLAUDE.md'));
    symlinkSync(join(root, '.copilot/context.md'), join(root, 'gemini.md'));
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'AGENTS.md',
          message: expect.stringContaining('is a real file'),
        }),
      ]),
    );
  });

  it('flags a symlink that is missing entirely', () => {
    root = buildRoot({ '.copilot/context.md': validContext });
    symlinkSync(join(root, '.copilot/context.md'), join(root, 'CLAUDE.md'));
    symlinkSync(join(root, '.copilot/context.md'), join(root, 'gemini.md'));
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: 'AGENTS.md', message: expect.stringContaining('missing') }),
      ]),
    );
  });

  it('flags a symlink pointing to the wrong target', () => {
    root = buildRoot({ '.copilot/context.md': validContext, 'docs/OTHER.md': 'unrelated' });
    symlinkSync(join(root, '.copilot/context.md'), join(root, 'CLAUDE.md'));
    symlinkSync(join(root, 'docs/OTHER.md'), join(root, 'AGENTS.md'));
    symlinkSync(join(root, '.copilot/context.md'), join(root, 'gemini.md'));
    const result = checkAgentContextFile(root, basePolicy());
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'AGENTS.md',
          message: expect.stringContaining('resolves to'),
        }),
      ]),
    );
  });
});
