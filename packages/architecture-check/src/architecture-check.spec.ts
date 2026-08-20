import { Project } from 'ts-morph';
import {
  checkErrorMapperCoverage,
  checkPrototypeChainSafety,
  checkSharedValueObjectErrorMapperCoverage,
  checkTransactionalIo,
  checkTransactionalSaves,
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

  it('covers a two-level error hierarchy via a generic base-class branch', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/domain/errors/demo-domain.error.ts': `
        export class DemoDomainError extends Error {}
        export class DemoChildError extends DemoDomainError {}
        export class DemoGrandchildError extends DemoChildError {}
      `,
      // A single generic branch on the root covers every class in the chain — including
      // DemoChildError, which has no branch of its own — matching "generic branches are
      // valid and must not force redundant subclass branches".
      '/repo/apps/backend/src/contexts/demo/infrastructure/http/demo-error.mapper.ts': `
        import { DemoDomainError } from '../../domain/errors/demo-domain.error';
        function map(error: unknown) { return error instanceof DemoDomainError ? 400 : 500; }
      `,
    });
    const result = checkErrorMapperCoverage(project);
    expectScannedTargets(result, 2);
    expect(result.findings).toHaveLength(0);
  });

  it('does not let a same-named class in an unrelated context satisfy coverage', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/domain/errors/demo-domain.error.ts': `
        export class DemoDomainError extends Error {}
        export class DemoNotFoundError extends DemoDomainError {}
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/http/demo-error.mapper.ts': `
        function map(error: unknown) { return error instanceof Error ? 500 : 400; }
      `,
      // A different, unrelated class that merely shares the same name — must not satisfy
      // demo's own DemoNotFoundError, whether referenced by real code or only by a comment.
      '/repo/apps/backend/src/contexts/other/domain/errors/other-domain.error.ts': `
        export class OtherDomainError extends Error {}
        export class DemoNotFoundError extends OtherDomainError {}
      `,
      '/repo/apps/backend/src/contexts/other/infrastructure/http/other-error.mapper.ts': `
        import { DemoNotFoundError } from '../../domain/errors/other-domain.error';
        // instanceof DemoNotFoundError -- deliberately only a comment, not real code
        function map(error: unknown) { return error instanceof DemoNotFoundError ? 404 : 500; }
      `,
    });
    const result = checkErrorMapperCoverage(project);
    expectScannedTargets(result, 2);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'error-mapper-coverage',
        file: expect.stringContaining('/demo/'),
      }),
    ]);
  });

  it('scans a concrete leaf error even when its own name happens to end in "DomainError"', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/domain/errors/demo-domain.error.ts': `
        export class DemoDomainError extends Error {}
        // A concrete, thrown leaf that happens to be named like a root — must still be
        // scanned and required to have its own coverage, not skipped by name suffix.
        export class SpecificDomainError extends DemoDomainError {}
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/http/demo-error.mapper.ts': `
        function map(error: unknown) { return error instanceof Error ? 500 : 400; }
      `,
    });
    const result = checkErrorMapperCoverage(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([expect.objectContaining({ rule: 'error-mapper-coverage' })]);
  });

  it('scans a concrete error class declared inside a namespace block', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/domain/errors/demo-domain.error.ts': `
        export class DemoDomainError extends Error {}
        // getClasses() only returns top-level declarations — a class nested inside a
        // namespace must still be found via a full descendant walk.
        export namespace Errors {
          export class NestedConcreteError extends DemoDomainError {}
        }
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/http/demo-error.mapper.ts': `
        function map(error: unknown) { return error instanceof Error ? 500 : 400; }
      `,
    });
    const result = checkErrorMapperCoverage(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([expect.objectContaining({ rule: 'error-mapper-coverage' })]);
  });

  it('only exempts the exact (class, path) pair named by a documented exception', () => {
    const files = {
      '/repo/apps/backend/src/contexts/demo/domain/errors/demo-domain.error.ts': `
        export class DemoDomainError extends Error {}
        export class DemoNotFoundError extends DemoDomainError {}
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/http/demo-error.mapper.ts': `
        function map(error: unknown) { return error instanceof Error ? 500 : 400; }
      `,
      // A same-named error in a different context — the exception below names only demo's
      // own file, so this one must still be scanned and reported.
      '/repo/apps/backend/src/contexts/other/domain/errors/other-domain.error.ts': `
        export class OtherDomainError extends Error {}
        export class DemoNotFoundError extends OtherDomainError {}
      `,
      '/repo/apps/backend/src/contexts/other/infrastructure/http/other-error.mapper.ts': `
        function map(error: unknown) { return error instanceof Error ? 500 : 400; }
      `,
    };
    const result = checkErrorMapperCoverage(fixtureProject(files), [
      {
        class: 'DemoNotFoundError',
        path: 'apps/backend/src/contexts/demo/domain/errors/demo-domain.error.ts',
      },
    ]);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'error-mapper-coverage',
        file: expect.stringContaining('/other/'),
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

  it('reports a VO create() that throws a bare Error via the new-less call form', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/value-objects/demo.vo.ts': `
        export class Demo {
          static create(value: string): Demo {
            if (!value) throw Error('required');
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

  it('does not count an imported-but-never-invoked shared/http helper as coverage', () => {
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
      '/repo/apps/backend/src/contexts/stale/domain/stale.aggregate.ts': `
        import { Demo } from '../../../shared/value-objects/demo.vo';
        export class Stale { static make(v: string) { return Demo.create(v); } }
      `,
      // Imports the shared helper but a prior refactor left the call site removed — an
      // unused import must not be treated as proof of coverage.
      '/repo/apps/backend/src/contexts/stale/infrastructure/http/stale-error.mapper.ts': `
        import { mapSharedDemoError } from '../../../../shared/http/demo-validation-error.mapper';
        export function mapStaleError(err: unknown): never {
          throw err as never;
        }
      `,
    });
    const result = checkSharedValueObjectErrorMapperCoverage(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({ rule: 'shared-vo-error-mapper-coverage' }),
    ]);
  });

  it('does not count a call to a local shadowing the imported shared/http helper as coverage', () => {
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
      '/repo/apps/backend/src/contexts/shadowed/domain/shadowed.aggregate.ts': `
        import { Demo } from '../../../shared/value-objects/demo.vo';
        export class Shadowed { static make(v: string) { return Demo.create(v); } }
      `,
      // Imports the real helper but never calls it — instead calls a same-named local
      // parameter that shadows it. Must not be treated as invoking the real helper.
      '/repo/apps/backend/src/contexts/shadowed/infrastructure/http/shadowed-error.mapper.ts': `
        import { mapSharedDemoError } from '../../../../shared/http/demo-validation-error.mapper';
        function delegate(mapSharedDemoError: (err: unknown) => void, err: unknown): never {
          mapSharedDemoError(err);
          throw err as never;
        }
        export function mapShadowedError(err: unknown): never {
          return delegate(() => undefined, err);
        }
      `,
    });
    const result = checkSharedValueObjectErrorMapperCoverage(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({ rule: 'shared-vo-error-mapper-coverage' }),
    ]);
  });

  it('resolves an aliased DomainErrorShape import when checking implements', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/domain/domain-error-shape.ts': `
        export interface DomainErrorShape { readonly code: string; readonly field?: string }
      `,
      '/repo/apps/backend/src/shared/value-objects/demo.vo.ts': `
        import { DomainErrorShape as Shape } from '../domain/domain-error-shape';
        export class DemoValidationError extends Error implements Shape {
          readonly code = 'DEMO_INVALID';
        }
        export class Demo {
          static create(value: string): Demo {
            if (!value) throw new DemoValidationError('required');
            return new Demo();
          }
        }
      `,
      '/repo/apps/backend/src/contexts/aliased/domain/aliased.aggregate.ts': `
        import { Demo } from '../../../shared/value-objects/demo.vo';
        export class Aliased { static make(v: string) { return Demo.create(v); } }
      `,
      '/repo/apps/backend/src/contexts/aliased/infrastructure/http/aliased-error.mapper.ts': `
        function map(error: unknown) { return error instanceof Error ? 500 : 400; }
      `,
    });
    const result = checkSharedValueObjectErrorMapperCoverage(project);
    // Scanned as a real target (the aliased implements clause was correctly resolved) and
    // reported uncovered, since aliased-error.mapper.ts has no instanceof branch for it.
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({ rule: 'shared-vo-error-mapper-coverage' }),
    ]);
  });

  it('resolves a derived interface that extends DomainErrorShape when checking implements', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/domain/domain-error-shape.ts': `
        export interface DomainErrorShape { readonly code: string; readonly field?: string }
      `,
      '/repo/apps/backend/src/shared/value-objects/demo.vo.ts': `
        import { DomainErrorShape } from '../domain/domain-error-shape';
        interface DerivedShape extends DomainErrorShape {}
        export class DemoValidationError extends Error implements DerivedShape {
          readonly code = 'DEMO_INVALID';
        }
        export class Demo {
          static create(value: string): Demo {
            if (!value) throw new DemoValidationError('required');
            return new Demo();
          }
        }
      `,
      '/repo/apps/backend/src/contexts/derived/domain/derived.aggregate.ts': `
        import { Demo } from '../../../shared/value-objects/demo.vo';
        export class Derived { static make(v: string) { return Demo.create(v); } }
      `,
      '/repo/apps/backend/src/contexts/derived/infrastructure/http/derived-error.mapper.ts': `
        function map(error: unknown) { return error instanceof Error ? 500 : 400; }
      `,
    });
    const result = checkSharedValueObjectErrorMapperCoverage(project);
    // Scanned (the derived-interface implements clause was correctly resolved back to the
    // canonical DomainErrorShape) and reported uncovered, since derived-error.mapper.ts has
    // no instanceof branch for it.
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({ rule: 'shared-vo-error-mapper-coverage' }),
    ]);
  });

  it('flags a consuming context with no HTTP error mapper at all, unless documented as an exception', () => {
    const files = {
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
      '/repo/apps/backend/src/contexts/mapperless/domain/mapperless.aggregate.ts': `
        import { Demo } from '../../../shared/value-objects/demo.vo';
        export class Mapperless { static make(v: string) { return Demo.create(v); } }
      `,
    };

    const unexempted = checkSharedValueObjectErrorMapperCoverage(fixtureProject(files));
    expectScannedTargets(unexempted, 1);
    expect(unexempted.findings).toEqual([
      expect.objectContaining({ rule: 'shared-vo-error-mapper-coverage' }),
    ]);

    const exempted = checkSharedValueObjectErrorMapperCoverage(
      fixtureProject(files),
      new Set(['mapperless']),
    );
    expectScannedTargets(exempted, 1);
    expect(exempted.findings).toHaveLength(0);
  });

  it('fails the zero-target contract for an empty scan', () => {
    const result = checkTransactionalSaves(new Project({ useInMemoryFileSystem: true }));
    expectZeroTargets(result);
  });
});
