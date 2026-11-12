import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  OperatorAuditBuilder,
  OperatorAuditEntityBuilder,
} from '../../../../test/builders/billing';
import { OperatorAuditEntity } from '../entities/operator-audit.entity';
import { operatorAuditToDomain, operatorAuditToEntity } from './typeorm-operator-audit.mapper';
import { TypeOrmOperatorAuditRepository } from './typeorm-operator-audit.repository';

function fakeManager(): {
  manager: EntityManager;
  inserted: unknown[];
  lookups: unknown[];
  state: { found: OperatorAuditEntity | null };
} {
  const inserted: unknown[] = [];
  const lookups: unknown[] = [];
  const state: { found: OperatorAuditEntity | null } = { found: null };
  const manager = {
    insert: (_entity: unknown, value: unknown) => {
      inserted.push(value);
      return Promise.resolve();
    },
    findOne: (_entity: unknown, options: unknown) => {
      lookups.push(options);
      return Promise.resolve(state.found);
    },
  } as unknown as EntityManager;
  return { manager, inserted, lookups, state };
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
  let own: ReturnType<typeof fakeManager>;
  let repo: TypeOrmOperatorAuditRepository;

  beforeEach(() => {
    own = fakeManager();
    repo = new TypeOrmOperatorAuditRepository({
      manager: own.manager,
    } as unknown as Repository<OperatorAuditEntity>);
  });

  it('inserts the mapped entity', async () => {
    const audit = new OperatorAuditBuilder().build();

    await repo.save(audit);

    expect(own.inserted).toEqual([operatorAuditToEntity(audit)]);
  });

  it('uses the transaction entity manager when one is active', async () => {
    const active = fakeManager();

    await runWithEntityManager(active.manager, () => repo.save(new OperatorAuditBuilder().build()));

    expect(own.inserted).toHaveLength(0);
    expect(active.inserted).toHaveLength(1);
  });

  it('finds by tenant and id together', async () => {
    const entity = new OperatorAuditEntityBuilder().build();
    own.state.found = entity;

    const found = await repo.findByIdAndTenant(entity.tenantId, entity.id);

    expect(own.lookups).toEqual([{ where: { tenantId: entity.tenantId, id: entity.id } }]);
    expect(found?.id).toBe(entity.id);
  });

  it('returns null when nothing matches', async () => {
    await expect(repo.findByIdAndTenant('t', 'i')).resolves.toBeNull();
  });
});
