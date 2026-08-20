import { checkNoJestFnForRepositoryOrPortMocks } from '../index';
import { expectScannedTargets, expectZeroTargets, fixtureProject } from '../testing/fixtures';

describe('checkNoJestFnForRepositoryOrPortMocks', () => {
  it('flags a jest.fn()-backed object literal passed for an I*Repository-typed parameter', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/application/ports/demo-repository.port.ts': `
        export interface IDemoRepository { findById(id: string): Promise<unknown> }
      `,
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.ts': `
        import { IDemoRepository } from './ports/demo-repository.port';
        export class DemoUseCase {
          constructor(private readonly repo: IDemoRepository) {}
        }
      `,
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.spec.ts': `
        import { DemoUseCase } from './demo.use-case';
        new DemoUseCase({ findById: jest.fn() });
      `,
    });
    const result = checkNoJestFnForRepositoryOrPortMocks(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'no-jest-fn-for-repository-or-port',
        message: expect.stringContaining('IDemoRepository'),
      }),
    ]);
  });

  it('flags a jest.fn()-backed variable (typed or untyped) later passed as the constructor argument', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/ports/event-bus.port.ts': `
        export interface IEventBus { publish(): void; subscribe(): void }
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.handler.ts': `
        import { IEventBus } from '../../../shared/ports/event-bus.port';
        export class DemoHandler {
          constructor(private readonly bus: IEventBus) {}
        }
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.handler.spec.ts': `
        import { DemoHandler } from './demo.handler';
        const mockBus = { publish: jest.fn(), subscribe: jest.fn() };
        new DemoHandler(mockBus);
      `,
    });
    const result = checkNoJestFnForRepositoryOrPortMocks(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'no-jest-fn-for-repository-or-port',
        message: expect.stringContaining('IEventBus'),
      }),
    ]);
  });

  it('flags a `let`-declared, jest.fn()-backed variable assigned later (e.g. in beforeEach), through an `as` cast', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/ports/outbox-repository.port.ts': `
        export interface IOutboxRepository { insert(): Promise<void> }
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.publisher.ts': `
        import { IOutboxRepository } from '../../../shared/ports/outbox-repository.port';
        export class DemoPublisher {
          constructor(private readonly repo: IOutboxRepository) {}
        }
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.publisher.spec.ts': `
        import { DemoPublisher } from './demo.publisher';
        describe('DemoPublisher', () => {
          let outboxRepo: jest.Mocked<IOutboxRepository>;
          beforeEach(() => {
            outboxRepo = { insert: jest.fn() } as unknown as jest.Mocked<IOutboxRepository>;
          });
          it('works', () => {
            new DemoPublisher(outboxRepo);
          });
        });
      `,
    });
    const result = checkNoJestFnForRepositoryOrPortMocks(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'no-jest-fn-for-repository-or-port',
        message: expect.stringContaining('IOutboxRepository'),
      }),
    ]);
  });

  it('flags a jest.fn()-backed mock forwarded through a helper function parameter (function declaration)', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/application/ports/demo-repository.port.ts': `
        export interface IDemoRepository { findById(id: string): Promise<unknown> }
      `,
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.ts': `
        import { IDemoRepository } from './ports/demo-repository.port';
        export class DemoUseCase {
          constructor(private readonly repo: IDemoRepository) {}
        }
      `,
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.spec.ts': `
        import { DemoUseCase } from './demo.use-case';
        function make(repo: IDemoRepository): DemoUseCase {
          return new DemoUseCase(repo);
        }
        make({ findById: jest.fn() });
      `,
    });
    const result = checkNoJestFnForRepositoryOrPortMocks(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'no-jest-fn-for-repository-or-port',
        message: expect.stringContaining('IDemoRepository'),
      }),
    ]);
  });

  it('flags a jest.fn()-backed mock forwarded through a helper function parameter (const arrow function)', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/application/ports/demo-repository.port.ts': `
        export interface IDemoRepository { findById(id: string): Promise<unknown> }
      `,
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.ts': `
        import { IDemoRepository } from './ports/demo-repository.port';
        export class DemoUseCase {
          constructor(private readonly repo: IDemoRepository) {}
        }
      `,
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.spec.ts': `
        import { DemoUseCase } from './demo.use-case';
        const make = (repo: IDemoRepository): DemoUseCase => new DemoUseCase(repo);
        make({ findById: jest.fn() });
      `,
    });
    const result = checkNoJestFnForRepositoryOrPortMocks(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'no-jest-fn-for-repository-or-port',
        message: expect.stringContaining('IDemoRepository'),
      }),
    ]);
  });

  it('does not flag a helper function parameter whose callers only ever pass a real InMemory double', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/application/ports/demo-repository.port.ts': `
        export interface IDemoRepository { findById(id: string): Promise<unknown> }
      `,
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.ts': `
        import { IDemoRepository } from './ports/demo-repository.port';
        export class DemoUseCase {
          constructor(private readonly repo: IDemoRepository) {}
        }
      `,
      '/repo/apps/backend/src/test/repositories/demo/in-memory-demo.repository.ts': `
        import { IDemoRepository } from '../../../contexts/demo/application/ports/demo-repository.port';
        export class InMemoryDemoRepository implements IDemoRepository {
          async findById(id: string): Promise<unknown> { return null; }
        }
      `,
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.spec.ts': `
        import { DemoUseCase } from './demo.use-case';
        import { InMemoryDemoRepository } from '../../../test/repositories/demo/in-memory-demo.repository';
        function make(repo: IDemoRepository): DemoUseCase {
          return new DemoUseCase(repo);
        }
        make(new InMemoryDemoRepository());
      `,
    });
    const result = checkNoJestFnForRepositoryOrPortMocks(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('flags a jest.fn()-backed mock for an interface named without the I-prefix, resolved via its ports/ path', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/ports/cache.port.ts': `
        export interface CachePort { get(key: string): Promise<unknown> }
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.repository.ts': `
        import { CachePort } from '../../../shared/ports/cache.port';
        export class CachingDemoRepository {
          constructor(private readonly cache: CachePort) {}
        }
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.repository.spec.ts': `
        import { CachingDemoRepository } from './demo.repository';
        new CachingDemoRepository({ get: jest.fn() });
      `,
    });
    const result = checkNoJestFnForRepositoryOrPortMocks(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'no-jest-fn-for-repository-or-port',
        message: expect.stringContaining('CachePort'),
      }),
    ]);
  });

  it('does not flag a jest.fn() used as a plain callback dependency', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.job.ts': `
        export class DemoJob {
          constructor(private readonly onTick: () => void) {}
        }
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.job.spec.ts': `
        import { DemoJob } from './demo.job';
        new DemoJob(jest.fn());
      `,
    });
    const result = checkNoJestFnForRepositoryOrPortMocks(project);
    expectZeroTargets(result);
  });

  it('does not flag a single-method jest.spyOn() on a concrete (non-port) class', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/shared/observability/app-logger.ts': `
        export class AppLogger { warn(message: string): void {} }
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/demo.repository.spec.ts': `
        import { AppLogger } from '../../../shared/observability/app-logger';
        const warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
      `,
    });
    const result = checkNoJestFnForRepositoryOrPortMocks(project);
    expectZeroTargets(result);
  });

  it('does not flag jest.fn() standing in for a concrete class dependency that is not a repository/port', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/llm/credits.client.ts': `
        export class CreditsClient {
          getRemainingBalanceUsd(): Promise<number> { return Promise.resolve(0); }
        }
      `,
      '/repo/apps/backend/src/contexts/demo/application/demo.job.ts': `
        import { CreditsClient } from '../infrastructure/llm/credits.client';
        export class DemoJob {
          constructor(private readonly creditsClient: CreditsClient) {}
        }
      `,
      '/repo/apps/backend/src/contexts/demo/application/demo.job.spec.ts': `
        import { DemoJob } from './demo.job';
        import { CreditsClient } from '../infrastructure/llm/credits.client';
        const creditsClient = { getRemainingBalanceUsd: jest.fn() } as unknown as CreditsClient;
        new DemoJob(creditsClient);
      `,
    });
    const result = checkNoJestFnForRepositoryOrPortMocks(project);
    expectZeroTargets(result);
  });

  it('does not flag a real InMemory double passed for a repository/port-typed parameter', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/application/ports/demo-repository.port.ts': `
        export interface IDemoRepository { findById(id: string): Promise<unknown> }
      `,
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.ts': `
        import { IDemoRepository } from './ports/demo-repository.port';
        export class DemoUseCase {
          constructor(private readonly repo: IDemoRepository) {}
        }
      `,
      '/repo/apps/backend/src/test/repositories/demo/in-memory-demo.repository.ts': `
        import { IDemoRepository } from '../../../contexts/demo/application/ports/demo-repository.port';
        export class InMemoryDemoRepository implements IDemoRepository {
          async findById(id: string): Promise<unknown> { return null; }
        }
      `,
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.spec.ts': `
        import { DemoUseCase } from './demo.use-case';
        import { InMemoryDemoRepository } from '../../../test/repositories/demo/in-memory-demo.repository';
        new DemoUseCase(new InMemoryDemoRepository());
      `,
    });
    const result = checkNoJestFnForRepositoryOrPortMocks(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toHaveLength(0);
  });

  it('does not flag a jest.fn() mocking a TypeORM Repository<T>/DataSource dependency inside an adapter spec', () => {
    // The typeorm-xxx.repository.spec.ts convention across this codebase mocks TypeORM's own
    // generic driver classes (Repository<T>, DataSource, EntityManager) to unit test the
    // concrete adapter that wraps them — those are not I*Repository/I*Port interfaces and must
    // stay unflagged, or every adapter spec in the codebase would false-positive.
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/infrastructure/repositories/typeorm-demo.repository.ts': `
        import { Repository } from 'typeorm';
        class DemoEntity {}
        export class TypeOrmDemoRepository {
          constructor(private readonly ormRepo: Repository<DemoEntity>) {}
        }
      `,
      '/repo/apps/backend/src/contexts/demo/infrastructure/repositories/typeorm-demo.repository.spec.ts': `
        import { TypeOrmDemoRepository } from './typeorm-demo.repository';
        const ormRepo = { find: jest.fn(), save: jest.fn() };
        new TypeOrmDemoRepository(ormRepo as never);
      `,
    });
    const result = checkNoJestFnForRepositoryOrPortMocks(project);
    expectZeroTargets(result);
  });

  it('flags a jest.fn()-backed mock for an interface that extends a repository/port interface, not just a direct match', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/application/ports/demo-repository.port.ts': `
        export interface IDemoRepository { findById(id: string): Promise<unknown> }
      `,
      '/repo/apps/backend/src/contexts/demo/application/extended-demo-repository.ts': `
        import { IDemoRepository } from './ports/demo-repository.port';
        export interface DemoRepository extends IDemoRepository {}
      `,
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.ts': `
        import { DemoRepository } from './extended-demo-repository';
        export class DemoUseCase {
          constructor(private readonly repo: DemoRepository) {}
        }
      `,
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.spec.ts': `
        import { DemoUseCase } from './demo.use-case';
        new DemoUseCase({ findById: jest.fn() });
      `,
    });
    const result = checkNoJestFnForRepositoryOrPortMocks(project);
    expectScannedTargets(result, 1);
    expect(result.findings).toEqual([
      expect.objectContaining({
        rule: 'no-jest-fn-for-repository-or-port',
        message: expect.stringContaining('IDemoRepository'),
      }),
    ]);
  });

  it('does not crash on a recursive forwarding helper — no finding, no stack overflow', () => {
    const project = fixtureProject({
      '/repo/apps/backend/src/contexts/demo/application/ports/demo-repository.port.ts': `
        export interface IDemoRepository { findById(id: string): Promise<unknown> }
      `,
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.ts': `
        import { IDemoRepository } from './ports/demo-repository.port';
        export class DemoUseCase {
          constructor(private readonly repo: IDemoRepository) {}
        }
      `,
      '/repo/apps/backend/src/contexts/demo/application/demo.use-case.spec.ts': `
        import { DemoUseCase } from './demo.use-case';
        function make(repo: IDemoRepository): DemoUseCase {
          if (Math.random() < 0) return make(repo);
          return new DemoUseCase(repo);
        }
      `,
    });
    expect(() => checkNoJestFnForRepositoryOrPortMocks(project)).not.toThrow();
  });

  it('fails the zero-target contract for an empty scan', () => {
    const result = checkNoJestFnForRepositoryOrPortMocks(fixtureProject({}));
    expectZeroTargets(result);
  });
});
