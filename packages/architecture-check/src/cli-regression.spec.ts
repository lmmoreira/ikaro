import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// TD37-S22 AC2 (Codex review, PR #455): reading cli.ts's exit-code contract in-process proves
// the logic is correct, but not that the real `pnpm architecture-check` command (what ci:fast
// and the pre-push hook actually run) rejects a violation. Spawns the real CLI as a subprocess
// against a real on-disk fixture, same approach as TD37-S23's e2e-quality.eslint.spec.ts AC3
// block / TD37-S18's eslint-next-plugin.eslint.spec.ts.
const repoRoot = resolve(__dirname, '../../..');
const backendContextsDir = resolve(repoRoot, 'apps/backend/src/contexts');

function runArchitectureCheck(): { status: number; output: string } {
  try {
    execFileSync('pnpm', ['architecture-check'], { cwd: repoRoot, stdio: 'pipe' });
    return { status: 0, output: '' };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error) {
      return {
        status: typeof error.status === 'number' ? error.status : 1,
        output: [
          'stdout' in error && Buffer.isBuffer(error.stdout) ? error.stdout.toString() : '',
          'stderr' in error && Buffer.isBuffer(error.stderr) ? error.stderr.toString() : '',
        ].join('\n'),
      };
    }
    return { status: 1, output: '' };
  }
}

describe('AC2: a real fixture violation fails the actual pnpm architecture-check command', () => {
  it('blocks a real transactional-save violation via the actual pnpm architecture-check command, then accepts the corrected fixture', () => {
    const fixtureDir = mkdtempSync(join(backendContextsDir, '__td37s22-fixture-'));
    const applicationDir = join(fixtureDir, 'application');
    mkdirSync(applicationDir);
    const fixtureFile = join(applicationDir, 'violation.use-case.ts');

    try {
      writeFileSync(
        fixtureFile,
        [
          'export interface ViolationUseCaseResult {',
          '  readonly ok: boolean;',
          '}',
          '',
          'export interface IFixtureRepository {',
          '  save(): Promise<void>;',
          '}',
          '',
          'export class ViolationUseCase {',
          '  constructor(private readonly repository: IFixtureRepository) {}',
          '',
          '  async execute(): Promise<ViolationUseCaseResult> {',
          '    await this.repository.save();',
          '    return { ok: true };',
          '  }',
          '}',
          '',
        ].join('\n'),
      );

      const violating = runArchitectureCheck();
      expect(violating.status).not.toBe(0);
      expect(violating.output).toContain('transactional-save');
      expect(violating.output).toContain('violation.use-case.ts');

      writeFileSync(
        fixtureFile,
        [
          'export interface ITransactionManager {',
          '  run<T>(callback: () => Promise<T>): Promise<T>;',
          '}',
          '',
          'export interface ViolationUseCaseResult {',
          '  readonly ok: boolean;',
          '}',
          '',
          'export interface IFixtureRepository {',
          '  save(): Promise<void>;',
          '}',
          '',
          'export class ViolationUseCase {',
          '  constructor(',
          '    private readonly txManager: ITransactionManager,',
          '    private readonly repository: IFixtureRepository,',
          '  ) {}',
          '',
          '  async execute(): Promise<ViolationUseCaseResult> {',
          '    await this.txManager.run(async () => {',
          '      await this.repository.save();',
          '    });',
          '    return { ok: true };',
          '  }',
          '}',
          '',
        ].join('\n'),
      );

      const corrected = runArchitectureCheck();
      expect(corrected.status).toBe(0);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  }, 180_000);
});
