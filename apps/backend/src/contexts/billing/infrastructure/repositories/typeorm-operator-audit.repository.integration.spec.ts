import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  OperatorAuditBuilder,
  OperatorAuditEntityBuilder,
} from '../../../../test/builders/billing';
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
    const audit = new OperatorAuditBuilder()
      .withTenantId(tenantId)
      .withAction('GRACE')
      .withReason('customer asked')
      .withDetails({ graceUntil: '2026-12-01T00:00:00.000Z' })
      .withOccurredAt(new Date('2026-11-12T10:00:00.000Z'))
      .build();

    await repo.save(audit);
    const found = await repo.findByIdAndTenant(tenantId, audit.id);

    expect(found).toEqual(audit);
    expect(found?.reason).toBe('customer asked');
  });

  it('tenant isolation: another tenant asking for the same id gets nothing', async () => {
    const tenantA = newTenant();
    const tenantB = newTenant();
    const audit = new OperatorAuditBuilder().withTenantId(tenantA).build();
    await repo.save(audit);

    await expect(repo.findByIdAndTenant(tenantB, audit.id)).resolves.toBeNull();
    await expect(repo.findByIdAndTenant(tenantA, audit.id)).resolves.not.toBeNull();
  });

  it('answers null for an id that does not exist', async () => {
    await expect(repo.findByIdAndTenant(newTenant(), uuidv7())).resolves.toBeNull();
  });

  it('the action CHECK rejects a value outside the closed set', async () => {
    const entity = new OperatorAuditEntityBuilder()
      .withTenantId(newTenant())
      .withAction('PAYMENT_OVERRIDE')
      .build();

    await expect(dataSource.getRepository(OperatorAuditEntity).insert(entity)).rejects.toThrow(
      /CHK_billing_operator_audit_action/,
    );
  });
});
