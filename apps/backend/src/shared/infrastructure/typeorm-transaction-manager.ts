import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ITransactionManager } from '../ports/transaction-manager.port';
import { runInNewTransaction } from './run-in-new-transaction';

@Injectable()
export class TypeOrmTransactionManager implements ITransactionManager {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    return runInNewTransaction(this.dataSource, () => work());
  }
}
