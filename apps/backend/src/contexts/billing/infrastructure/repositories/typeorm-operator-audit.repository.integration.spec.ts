import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { OperatorAudit } from '../../domain/operator-audit';
import { createTestDataSource } from '../../../../test/test-datasource';
import { OperatorAuditEntity } from '../entities/operator-audit.entity';
import { TypeOrmOperatorAuditRepository } from './typeorm-operator-audit.repository';

describe('TypeOrmOperatorAuditRepository (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmOperatorAuditRepository;
  // A fresh tenant per scenario; its rows are deleted after each test.
  const tenants: string[] = [];

  const newTenant = (): string => {
    const tenantId = uuidv7();
    tenants.push(tenantId);
    return tenantId;
  };

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmOperatorAuditRepository(dataSource.getRepository(OperatorAuditEntity));
  });

  afterEach(async () => {
    await dataSource
      .createQueryBuilder()
      .delete()
      .from(OperatorAuditEntity)
      .where('tenant_id IN (:...tenants)', { tenants: tenants.length > 0 ? tenants : [uuidv7()] })
      .execute();
    tenants.length = 0;
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('persists a record and reads it back by (tenantId, id), reason included', async () => {
    const tenantId = newTenant();
    const audit = OperatorAudit.record({
      tenantId,
      actor: 'ops@ikaro',
      action: 'GRACE',
      reason: 'customer asked',
      details: { graceUntil: '2026-12-01T00:00:00.000Z' },
      now: new Date('2026-11-12T10:00:00.000Z'),
    });

    await repo.save(audit);
    const found = await repo.findByIdAndTenant(tenantId, audit.id);

    expect(found).toEqual(audit);
    expect(found?.reason).toBe('customer asked');
  });

  it('tenant isolation: another tenant asking for the same id gets nothing', async () => {
    const tenantA = newTenant();
    const tenantB = newTenant();
    const audit = OperatorAudit.record({
      tenantId: tenantA,
      actor: 'ops@ikaro',
      action: 'SUSPEND',
      reason: 'abuse report',
      now: new Date(),
    });
    await repo.save(audit);

    await expect(repo.findByIdAndTenant(tenantB, audit.id)).resolves.toBeNull();
    await expect(repo.findByIdAndTenant(tenantA, audit.id)).resolves.not.toBeNull();
  });

  it('answers null for an id that does not exist', async () => {
    await expect(repo.findByIdAndTenant(newTenant(), uuidv7())).resolves.toBeNull();
  });

  it('the action CHECK rejects a value outside the closed set', async () => {
    const entity = new OperatorAuditEntity();
    entity.id = uuidv7();
    entity.tenantId = newTenant();
    entity.actor = 'ops@ikaro';
    entity.action = 'PAYMENT_OVERRIDE';
    entity.payload = { reason: 'x' };
    entity.occurredAt = new Date();

    await expect(dataSource.getRepository(OperatorAuditEntity).insert(entity)).rejects.toThrow(
      /CHK_billing_operator_audit_action/,
    );
  });
});
