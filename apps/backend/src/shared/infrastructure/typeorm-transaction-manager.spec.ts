import { DataSource, EntityManager } from 'typeorm';
import { getActiveEntityManager, scheduleAfterCommit } from './transaction-context';
import { TypeOrmTransactionManager } from './typeorm-transaction-manager';

describe('TypeOrmTransactionManager', () => {
  it('wraps work in a DataSource transaction and propagates EntityManager via AsyncLocalStorage', async () => {
    const mockEntityManager = {} as EntityManager;
    const mockDataSource = {
      transaction: jest.fn((fn: (em: EntityManager) => Promise<void>) => fn(mockEntityManager)),
    } as unknown as DataSource;

    const txManager = new TypeOrmTransactionManager(mockDataSource);

    let capturedManager: EntityManager | undefined;
    await txManager.run(async () => {
      capturedManager = getActiveEntityManager();
    });

    expect(mockDataSource.transaction).toHaveBeenCalled();
    expect(capturedManager).toBe(mockEntityManager);
  });

  it('returns the value produced by the work function', async () => {
    const mockDataSource = {
      transaction: jest.fn((fn: (em: EntityManager) => Promise<number>) => fn({} as EntityManager)),
    } as unknown as DataSource;

    const result = await new TypeOrmTransactionManager(mockDataSource).run(async () => 42);

    expect(result).toBe(42);
  });

  it('runs after-commit callbacks only after the transaction resolves', async () => {
    const calls: string[] = [];
    const mockDataSource = {
      transaction: jest.fn(async (fn: (em: EntityManager) => Promise<string>) => {
        const result = await fn({} as EntityManager);
        calls.push('transaction-resolved');
        return result;
      }),
    } as unknown as DataSource;

    const result = await new TypeOrmTransactionManager(mockDataSource).run(async () => {
      calls.push('work-started');
      await scheduleAfterCommit(() => {
        calls.push('after-commit');
      });
      calls.push('work-finished');
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(calls).toEqual([
      'work-started',
      'work-finished',
      'transaction-resolved',
      'after-commit',
    ]);
  });
});
