import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ITransactionManager } from '../ports/transaction-manager.port';
import {
  createTransactionContext,
  flushAfterCommitCallbacks,
  runWithTransactionContext,
} from './transaction-context';

@Injectable()
export class TypeOrmTransactionManager implements ITransactionManager {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    let context:
      | {
          entityManager: EntityManager;
          afterCommitCallbacks: Array<() => Promise<void> | void>;
        }
      | undefined;

    const result = await this.dataSource.transaction(async (entityManager) => {
      context = createTransactionContext(entityManager);
      return runWithTransactionContext(context, work);
    });

    if (context) {
      await flushAfterCommitCallbacks(context);
    }

    return result;
  }
}
