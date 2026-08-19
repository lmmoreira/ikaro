import { Project } from 'ts-morph';
import {
  checkErrorMapperCoverage,
  checkPrototypeChainSafety,
  checkSharedValueObjectErrorMapperCoverage,
  checkTransactionalIo,
  checkTransactionalSaves,
  checkUnsafeUseExisting,
  checkValueObjectCreateNeverThrowsBareError,
} from './index';
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
        async function nested() {
          await tx.run(async () => { queueMicrotask(async () => { await repository.save(); }); });
        }
        async function invalid() { await repository.save(); }
        async function unrelated() { await draft.save(); }
      `,
    });
    const result = checkTransactionalSaves(project);
    expectScannedTargets(result, 3);
    expect(result.findings).toHaveLength(1);
  });

  it('rejects registered external I/O inside a transaction while allowing post-commit scheduling', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/application/ports/external.port.ts': `
        export interface IExternalPort { call(): Promise<void> }
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/external.adapter.ts': `
        import { IExternalPort } from '../application/ports/external.port';
        class ExternalAdapter implements IExternalPort { async call(): Promise<void> {} }
      `,
      '/repo/apps/backend/src/shared/infrastructure/transaction-context.ts': `
        export function scheduleAfterCommit(callback: () => Promise<void>): Promise<void> {
          return Promise.resolve(callback());
        }
      `,
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.ts': `
        import { IExternalPort } from './ports/external.port';
        import { scheduleAfterCommit } from '../../../shared/infrastructure/transaction-context';
        interface ITransactionManager {
          run(callback: () => Promise<void>): Promise<void>
          scheduleAfterCommit(callback: () => Promise<void>): Promise<void>
        }
        declare const tx: ITransactionManager;
        declare const external: IExternalPort;
        async function invalid() { await tx.run(async () => { await external.call(); }); }
        async function scheduled() {
          await tx.run(async () => {
            await tx.scheduleAfterCommit(async () => { await external.call(); });
          });
        }
        async function directlyScheduled() {
          await tx.run(async () => {
            await scheduleAfterCommit(async () => { await external.call(); });
          });
        }
        async function nestedButAwaited() {
          await tx.run(async () => {
            await Promise.resolve().then(async () => { await external.call(); });
          });
        }
        async function nestedMicrotask() {
          await tx.run(async () => { queueMicrotask(async () => { await external.call(); }); });
        }
        async function afterTransaction() { await tx.run(async () => undefined); await external.call(); }
      `,
    });
    const result = checkTransactionalIo(project, [
      {
        portFile: 'apps/backend/src/contexts/demo/application/ports/external.port.ts',
        interfaceName: 'IExternalPort',
        methodName: 'call',
        adapterPaths: ['apps/backend/src/contexts/demo/infrastructure/external.adapter.ts'],
      },
    ]);
    expectScannedTargets(result, 7);
    expect(result.findings).toEqual([
      expect.objectContaining({ rule: 'transactional-io', line: 10 }),
      expect.objectContaining({ rule: 'transactional-io', line: 23 }),
      expect.objectContaining({ rule: 'transactional-io', line: 27 }),
    ]);
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

  it('reports an unmapped concrete domain error with its source location and expected mapper path', () => {
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
      expect.objectContaining({
        rule: 'error-mapper-coverage',
        line: 3,
        message: expect.stringContaining('contexts/demo/infrastructure/http/demo-error.mapper.ts'),
      }),
    ]);
  });

  it('flags a direct Error subclass with a constructor that never fixes the prototype chain', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/domain/errors/demo.error.ts': `
        export class BrokenDirectError extends Error {
          constructor(message: string) {
            super(message);
          }
        }
        export class FixedDirectError extends Error {
          constructor(message: string) {
            super(message);
            Object.setPrototypeOf(this, new.target.prototype);
          }
        }
        export class NoOwnConstructorError extends Error {}
        export class DescendantError extends FixedDirectError {
          constructor(id: string) {
            super('not found: ' + id);
          }
        }
      `,
    });
    const result = checkPrototypeChainSafety(project);
    // Scanned: BrokenDirectError + FixedDirectError only. NoOwnConstructorError has no
    // declared constructor (implicitly correct); DescendantError isn't a *direct* Error
    // subclass, so it inherits FixedDirectError's fix and is out of this check's scope.
    expectScannedTargets(result, 2);
    expect(result.findings).toEqual([
      expect.objectContaining({ rule: 'error-prototype-chain', line: 3 }),
    ]);
  });

  it('does not flag descendants that rely on their direct-Error-subclass ancestor', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/domain/errors/demo.error.ts': `
        export class DemoDomainError extends Error {
          constructor(message: string) {
            super(message);
            Object.setPrototypeOf(this, new.target.prototype);
          }
        }
        export class ServiceNotFoundError extends DemoDomainError {
          constructor(id: string) {
            super('not found: ' + id);
          }
        }
      `,
    });
    const result = checkPrototypeChainSafety(project);
    // Only DemoDomainError (the direct Error subclass) is in scope; ServiceNotFoundError
    // extends DemoDomainError, not Error, so it's excluded regardless of its own constructor.
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('requires a VO create() to never throw a bare Error', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/value-objects/demo.vo.ts': `
        export class DemoValidationError extends Error {}
        export class Demo {
          static create(value: string): Demo {
            if (!value) throw new DemoValidationError('required');
            return new Demo();
          }
        }
      `,
    });
    const result = checkValueObjectCreateNeverThrowsBareError(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('reports a VO create() that throws a bare Error', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/value-objects/demo.vo.ts': `
        export class Demo {
          static create(value: string): Demo {
            if (!value) throw new Error('required');
            return new Demo();
          }
        }
      `,
    });
    const result = checkValueObjectCreateNeverThrowsBareError(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({ rule: 'vo-create-no-bare-error', line: 3 }),
    ]);
  });

  it('ignores non-static create() members and files outside a value-objects directory', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/domain/demo.aggregate.ts': `
        export class Demo {
          create(value: string): Demo {
            if (!value) throw new Error('required');
            return new Demo();
          }
        }
      `,
    });
    const result = checkValueObjectCreateNeverThrowsBareError(project);
    expectZeroTargets(result);
  });

  it('requires a shared VO error to be mapped by every consuming context, directly or via a shared/http helper', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/domain/domain-error-shape.ts': `
        export interface DomainErrorShape { readonly code: string; readonly field?: string }
      `,
      '/repo/apps/backend/src/shared/value-objects/demo.vo.ts': `
        import { DomainErrorShape } from '../domain/domain-error-shape';
        export class DemoValidationError extends Error implements DomainErrorShape {
          readonly code = 'DEMO_INVALID';
        }
        export class Demo {
          static create(value: string): Demo {
            if (!value) throw new DemoValidationError('required');
            return new Demo();
          }
        }
      `,
      '/repo/apps/backend/src/shared/http/demo-validation-error.mapper.ts': `
        import { DemoValidationError } from '../value-objects/demo.vo';
        export function mapSharedDemoError(err: unknown): void {
          if (err instanceof DemoValidationError) throw err;
        }
      `,
      '/repo/apps/backend/src/contexts/covered/domain/covered.aggregate.ts': `
        import { Demo } from '../../../shared/value-objects/demo.vo';
        export class Covered { static make(v: string) { return Demo.create(v); } }
      `,
      '/repo/apps/backend/src/contexts/covered/infrastructure/http/covered-error.mapper.ts': `
        import { mapSharedDemoError } from '../../../../shared/http/demo-validation-error.mapper';
        export function mapCoveredError(err: unknown): never {
          mapSharedDemoError(err);
          throw err as never;
        }
      `,
      '/repo/apps/backend/src/contexts/uncovered/domain/uncovered.aggregate.ts': `
        import { Demo } from '../../../shared/value-objects/demo.vo';
        export class Uncovered { static make(v: string) { return Demo.create(v); } }
      `,
      '/repo/apps/backend/src/contexts/uncovered/infrastructure/http/uncovered-error.mapper.ts': `
        export function mapUncoveredError(err: unknown): never {
          throw err as never;
        }
      `,
    });
    const result = checkSharedValueObjectErrorMapperCoverage(project);
    expectScannedTargets(result, 2);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'shared-vo-error-mapper-coverage',
        message: expect.stringContaining('"uncovered"'),
      }),
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
