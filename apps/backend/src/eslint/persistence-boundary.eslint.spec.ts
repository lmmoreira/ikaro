import { resolve } from 'node:path';
import { Linter } from 'eslint';

const backendRoot = resolve(__dirname, '../..');
// Load the actual CommonJS flat config rather than duplicating its rules in this spec. ESLint's
// higher-level config loader uses dynamic import, which Jest's normal unit-test command does not
// enable; Linter executes the same config array without that test-runtime dependency.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const productionConfig = require(resolve(backendRoot, 'eslint.config.js')) as Linter.Config[];

describe('TD37-S02 persistence boundary', () => {
  const eslint = new Linter({ configType: 'flat' });

  function lint(source: string, filePath: string) {
    return eslint.verify(source, productionConfig, filePath);
  }

  it('rejects configured TypeORM bypass APIs and namespace imports outside adapters', () => {
    const messages = lint(
      `
        import {
          Connection, DataSource, DeleteQueryBuilder, EntityManager, getConnection,
          getConnectionManager, getManager, getMongoRepository, getRepository, createConnection,
          createConnections,
          getTreeRepository, InsertQueryBuilder, MongoRepository, QueryBuilder,
          QueryRunner, Repository, SelectQueryBuilder, TreeRepository, UpdateQueryBuilder,
        } from 'typeorm';
        import * as TypeOrm from 'typeorm';
        import { getDataSourceToken, InjectDataSource, InjectRepository } from '@nestjs/typeorm';
        export {
          Connection, DataSource, DeleteQueryBuilder, EntityManager, getConnection,
          getConnectionManager, getDataSourceToken, getManager, getMongoRepository,
          getRepository, getTreeRepository, createConnection, createConnections, InjectDataSource, InjectRepository,
          InsertQueryBuilder, MongoRepository, QueryBuilder, QueryRunner, Repository,
          SelectQueryBuilder, TreeRepository, TypeOrm, UpdateQueryBuilder,
        };
      `,
      'src/shared/infrastructure/outbox/outbox-publisher.ts',
    );

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'no-restricted-imports',
          message: expect.stringContaining('docs/AGENT_PATTERNS.md Pattern #1'),
        }),
        expect.objectContaining({
          ruleId: 'no-restricted-syntax',
          message: expect.stringContaining('docs/AGENT_PATTERNS.md Pattern #1'),
        }),
      ]),
    );
  });

  it('permits TypeORM persistence imports in the explicit outbox repository adapter exception', () => {
    const messages = lint(
      `
        import { InjectRepository } from '@nestjs/typeorm';
        import { EntityManager, Repository } from 'typeorm';
        export { EntityManager, InjectRepository, Repository };
      `,
      'src/shared/infrastructure/outbox/typeorm-outbox.repository.ts',
    );

    expect(
      messages.filter(
        (message) =>
          message.ruleId === 'no-restricted-imports' || message.ruleId === 'no-restricted-syntax',
      ),
    ).toHaveLength(0);
  });

  it('permits a conventional repository adapter and the reviewed availability adapter', () => {
    const source = `
      import { InjectRepository } from '@nestjs/typeorm';
      import { DataSource, EntityManager, Repository } from 'typeorm';
      export { DataSource, EntityManager, InjectRepository, Repository };
    `;
    for (const filePath of [
      'src/contexts/booking/infrastructure/repositories/typeorm-booking.repository.ts',
      'src/contexts/booking/infrastructure/cross-context/typeorm-booking-availability.adapter.ts',
    ]) {
      const messages = lint(source, filePath).filter(
        (message) =>
          message.ruleId === 'no-restricted-imports' || message.ruleId === 'no-restricted-syntax',
      );
      expect(messages).toHaveLength(0);
    }
  });

  it('does not exempt a new file merely because it is in a repository directory', () => {
    const messages = lint(
      "import { Repository } from 'typeorm'; export { Repository };",
      'src/contexts/booking/infrastructure/repositories/unreviewed.repository.ts',
    );

    expect(messages).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: 'no-restricted-imports' })]),
    );
  });

  it('forbids repository ports from opening their own transaction callback', () => {
    const messages = lint(
      'export interface IExampleRepository { runInTransaction(): void; }',
      'src/shared/ports/example-repository.port.ts',
    );

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'no-restricted-syntax',
          message: expect.stringContaining('Repository ports must not own transactions'),
        }),
      ]),
    );
  });

  it('forbids event-bus publishing inside a shared transaction callback', () => {
    const messages = lint(
      'txManager.run(() => eventBus.publish(event));',
      'src/shared/infrastructure/outbox/outbox-publisher.ts',
    );

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'no-restricted-syntax',
          message: expect.stringContaining('Do not call eventBus.publish() inside txManager.run()'),
        }),
      ]),
    );
  });
});
