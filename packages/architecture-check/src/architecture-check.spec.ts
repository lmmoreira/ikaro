import { Project } from 'ts-morph';
import { checkErrorMapperCoverage, checkTransactionalSaves, checkUnsafeUseExisting } from './index';
import { expectScannedTargets, expectZeroTargets, fixtureProject } from './testing/fixtures';

describe('architecture checks', () => {
  it('accepts repository saves inside a transaction and rejects saves outside it', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.ts': `
        interface ITransactionManager { run(callback: () => Promise<void>): Promise<void> }
        interface Repository { save(): Promise<void> }
        interface Draft { save(): Promise<void> }
        declare const tx: ITransactionManager;
        declare const repository: Repository;
        declare const draft: Draft;
        async function valid() { await tx.run(async () => { await repository.save(); }); }
        async function invalid() { await repository.save(); }
        async function unrelated() { await draft.save(); }
        async function deferred() {
          await tx.run(async () => { queueMicrotask(() => { void repository.save(); }); });
        }
      `,
    });
    const result = checkTransactionalSaves(project);
    expectScannedTargets(result, 3);
    expect(result.findings).toHaveLength(2);
  });

  it('requires each concrete domain error to be referenced by a mapper', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/domain/errors/demo-domain.error.ts': `
        class DemoDomainError extends Error {}
        class DemoNotFoundError extends DemoDomainError {}
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/http/demo-error.mapper.ts': `
        function map(error: unknown) { return error instanceof DemoNotFoundError ? 404 : 500; }
      `,
    });
    const result = checkErrorMapperCoverage(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('reports an unmapped concrete domain error with its source location', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/domain/errors/demo-domain.error.ts': `
        class DemoDomainError extends Error {}
        class DemoNotFoundError extends DemoDomainError {}
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/http/demo-error.mapper.ts': `
        function map(error: unknown) { return error instanceof Error ? 500 : 400; }
      `,
    });
    const result = checkErrorMapperCoverage(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({ rule: 'error-mapper-coverage', line: 3 }),
    ]);
  });

  it('rejects unsafe class aliases while allowing token aliases', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.module.ts': `
        function Module(metadata: unknown): ClassDecorator { return () => undefined; }
        class Adapter {}
        const ADAPTER = Symbol('ADAPTER');
        const EVENT_BUS = Symbol('EVENT_BUS');
        const TRIGGER_BUS = Symbol('TRIGGER_BUS');
        const unrelated = [Adapter, { provide: ADAPTER, useExisting: Adapter }];
        @Module({ providers: [Adapter, { provide: ADAPTER, useExisting: Adapter }, { provide: TRIGGER_BUS, useExisting: EVENT_BUS }] })
        class DemoModule {}
      `,
    });
    const result = checkUnsafeUseExisting(project);
    expectScannedTargets(result, 2);
    expect(result.findings).toHaveLength(1);
  });

  it('fails the zero-target contract for an empty scan', () => {
    const result = checkTransactionalSaves(new Project({ useInMemoryFileSystem: true }));
    expectZeroTargets(result);
  });
});
