import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  OperatorAuditBuilder,
  OperatorAuditEntityBuilder,
} from '../../../../test/builders/billing';
import { OperatorAuditEntity } from '../entities/operator-audit.entity';
import { operatorAuditToDomain, operatorAuditToEntity } from './typeorm-operator-audit.mapper';
import { TypeOrmOperatorAuditRepository } from './typeorm-operator-audit.repository';

function fakeManager(found: OperatorAuditEntity | null = null): {
  manager: EntityManager;
  inserted: unknown[];
  lookups: unknown[];
} {
  const inserted: unknown[] = [];
  const lookups: unknown[] = [];
  const manager = {
    insert: (_entity: unknown, value: unknown) => {
      inserted.push(value);
      return Promise.resolve();
    },
    findOne: (_entity: unknown, options: unknown) => {
      lookups.push(options);
      return Promise.resolve(found);
    },
  } as unknown as EntityManager;
  return { manager, inserted, lookups };
}

describe('operator audit mapper', () => {
  it('writes the reason into the payload and reads it back out', () => {
    const audit = new OperatorAuditBuilder()
      .withAction('GRACE')
      .withReason('customer asked')
      .withDetails({ graceUntil: '2026-12-01T00:00:00.000Z' })
      .build();

    const entity = operatorAuditToEntity(audit);
    const back = operatorAuditToDomain(entity);

    expect(entity.payload).toEqual({
      graceUntil: '2026-12-01T00:00:00.000Z',
      reason: 'customer asked',
    });
    expect(back).toEqual(audit);
  });

  it('reads a row without a reason as an empty reason (it was never written by the domain)', () => {
    const entity = new OperatorAuditEntityBuilder().withPayload({}).build();

    expect(operatorAuditToDomain(entity).reason).toBe('');
  });
});

describe('TypeOrmOperatorAuditRepository', () => {
  const repoOf = (manager: EntityManager): TypeOrmOperatorAuditRepository =>
    new TypeOrmOperatorAuditRepository({ manager } as unknown as Repository<OperatorAuditEntity>);

  it('inserts the mapped entity', async () => {
    const { manager, inserted } = fakeManager();
    const audit = new OperatorAuditBuilder().build();

    await repoOf(manager).save(audit);

    expect(inserted).toEqual([operatorAuditToEntity(audit)]);
  });

  it('uses the transaction entity manager when one is active', async () => {
    const own = fakeManager();
    const active = fakeManager();

    await runWithEntityManager(active.manager, () =>
      repoOf(own.manager).save(new OperatorAuditBuilder().build()),
    );

    expect(own.inserted).toHaveLength(0);
    expect(active.inserted).toHaveLength(1);
  });

  it('finds by tenant and id together', async () => {
    const entity = new OperatorAuditEntityBuilder().build();
    const { manager, lookups } = fakeManager(entity);

    const found = await repoOf(manager).findByIdAndTenant(entity.tenantId, entity.id);

    expect(lookups).toEqual([{ where: { tenantId: entity.tenantId, id: entity.id } }]);
    expect(found?.id).toBe(entity.id);
  });

  it('returns null when nothing matches', async () => {
    const { manager } = fakeManager(null);

    await expect(repoOf(manager).findByIdAndTenant('t', 'i')).resolves.toBeNull();
  });
});
