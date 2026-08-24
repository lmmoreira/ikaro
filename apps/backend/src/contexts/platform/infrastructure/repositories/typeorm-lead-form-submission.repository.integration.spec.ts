import { DataSource, Repository } from 'typeorm';
import { TenantEntityBuilder } from '../../../../test/builders/platform/tenant-entity.builder';
import { makeConfigService } from '../../../../test/infrastructure/fake-config-service';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { createTestDataSource } from '../../../../test/test-datasource';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { OutboxEventEntity } from '../../../../shared/infrastructure/outbox/outbox-event.entity';
import { OutboxPublisher } from '../../../../shared/infrastructure/outbox/outbox-publisher';
import { OutboxRelayService } from '../../../../shared/infrastructure/outbox/outbox-relay.service';
import { TypeOrmOutboxRepository } from '../../../../shared/infrastructure/outbox/typeorm-outbox.repository';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { todayUTC } from '../../../../shared/utils/calendar-date';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { LeadFormSubmission } from '../../domain/lead-form-submission.aggregate';
import { TenantEntity } from '../entities/tenant.entity';
import { LeadFormSubmissionEntity } from '../entities/lead-form-submission.entity';
import { TypeOrmLeadFormSubmissionRepository } from './typeorm-lead-form-submission.repository';

// TD24-S02 pattern — LeadFormSubmission is the 4th aggregate to join the transactional-outbox
// pattern (after Booking/Staff/Tenant), mirroring
// typeorm-booking.repository.outbox-cutover.integration.spec.ts's own cutover coverage.
describe('TypeOrmLeadFormSubmissionRepository (integration)', () => {
  let dataSource: DataSource;
  let entityRepo: Repository<LeadFormSubmissionEntity>;
  let outboxRepo: Repository<OutboxEventEntity>;
  let typeOrmOutboxRepo: TypeOrmOutboxRepository;
  let txManager: TypeOrmTransactionManager;
  const TENANT_A = uuidv7();
  const TENANT_B = uuidv7();

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    entityRepo = dataSource.getRepository(LeadFormSubmissionEntity);
    outboxRepo = dataSource.getRepository(OutboxEventEntity);
    typeOrmOutboxRepo = new TypeOrmOutboxRepository(outboxRepo);
    txManager = new TypeOrmTransactionManager(dataSource);

    const tenantRepo = dataSource.getRepository(TenantEntity);
    await tenantRepo.save(
      new TenantEntityBuilder().withId(TENANT_A).withSlug(`lead-form-tenant-a-${TENANT_A}`).build(),
    );
    await tenantRepo.save(
      new TenantEntityBuilder().withId(TENANT_B).withSlug(`lead-form-tenant-b-${TENANT_B}`).build(),
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await entityRepo.delete({ tenantId: TENANT_A });
    await entityRepo.delete({ tenantId: TENANT_B });
    await outboxRepo.delete({ tenantId: TENANT_A });
    await outboxRepo.delete({ tenantId: TENANT_B });
  });

  function makeRepo(eventBus: InMemoryEventBus, inlineDispatchEnabled = false) {
    const config = makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: inlineDispatchEnabled });
    const relay = new OutboxRelayService(
      typeOrmOutboxRepo,
      eventBus,
      new InMemoryInboxRepository(),
      config,
      txManager,
    );
    const outboxPublisher = new OutboxPublisher(typeOrmOutboxRepo, relay, config);
    return new TypeOrmLeadFormSubmissionRepository(entityRepo, outboxPublisher);
  }

  function buildSubmission(tenantId: string, overrides: Partial<{ ipAddress: string }> = {}) {
    return LeadFormSubmission.create({
      tenantId,
      customerId: null,
      name: 'Maria Silva',
      email: `lead-${uuidv7()}@example.com`,
      phone: '+5511912345678',
      answers: [
        { questionId: 'q1', questionLabel: 'Origem', questionType: 'TEXT', answerValue: 'Google' },
      ],
      ipAddress: overrides.ipAddress ?? '203.0.113.10',
      retentionMonths: 6,
      correlationId: `corr-${uuidv7()}`,
    });
  }

  it('creates and retrieves a submission — all fields survive the round-trip', async () => {
    const repo = makeRepo(new InMemoryEventBus());
    const submission = buildSubmission(TENANT_A);

    await txManager.run(() => repo.save(submission));

    const found = await entityRepo.findOne({ where: { id: submission.id } });
    expect(found).not.toBeNull();
    expect(found!.tenantId).toBe(TENANT_A);
    expect(found!.name).toBe('Maria Silva');
    expect(found!.email).toBe(submission.email.address);
    expect(found!.phone).toBe('+5511912345678');
    expect(found!.answers).toEqual(submission.answers);
    expect(found!.ipAddress).toBe('203.0.113.10');
    expect(found!.customerId).toBeNull();
  });

  it('drains the domain event into shared.outbox in the same transaction as the insert', async () => {
    const eventBus = new InMemoryEventBus();
    const repo = makeRepo(eventBus);
    const submission = buildSubmission(TENANT_A);
    const pendingEventId = submission.domainEvents[0].eventId;

    await txManager.run(() => repo.save(submission));

    const outboxRow = await outboxRepo.findOne({ where: { id: pendingEventId } });
    expect(outboxRow).not.toBeNull();
    expect(outboxRow!.tenantId).toBe(TENANT_A);
    expect(outboxRow!.eventName).toBe('LeadFormSubmissionReceived');

    const savedRow = await entityRepo.findOne({ where: { id: submission.id } });
    expect(savedRow).not.toBeNull();
  });

  it('rolls back the outbox row together with the business write when the outer transaction throws', async () => {
    const eventBus = new InMemoryEventBus();
    const repo = makeRepo(eventBus);
    const submission = buildSubmission(TENANT_A);
    const pendingEventId = submission.domainEvents[0].eventId;

    await expect(
      txManager.run(async () => {
        await repo.save(submission);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    expect(await entityRepo.findOne({ where: { id: submission.id } })).toBeNull();
    expect(await outboxRepo.findOne({ where: { id: pendingEventId } })).toBeNull();
  });

  it('uses the ambient EntityManager to join an already-open transaction (no nested transaction)', async () => {
    const eventBus = new InMemoryEventBus();
    const repo = makeRepo(eventBus);
    const submission = buildSubmission(TENANT_A);

    await txManager.run(async () => {
      expect(getActiveEntityManager()).toBeDefined();
      await repo.save(submission);
    });

    expect(await entityRepo.findOne({ where: { id: submission.id } })).not.toBeNull();
  });

  it('creates a real UNIQUE (tenant_id, id) constraint on lead_form_submissions — required as S12/lead_form_answers own future composite FK target', async () => {
    const rows = (await dataSource.query(
      `
        SELECT kcu.column_name, kcu.ordinal_position
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'platform'
          AND tc.table_name = 'lead_form_submissions'
          AND tc.constraint_type = 'UNIQUE'
        ORDER BY kcu.ordinal_position
      `,
    )) as Array<{ column_name: string; ordinal_position: number }>;

    expect(rows.map((r) => r.column_name)).toEqual(['tenant_id', 'id']);
  });

  describe('countByTenantAndDate / countByTenantIpAndDate — tenant isolation (CLAUDE.md §2)', () => {
    it('Tenant B submissions never count against Tenant A cap, and vice versa', async () => {
      const repo = makeRepo(new InMemoryEventBus());
      const date = todayUTC();
      const sharedIp = '198.51.100.20';

      await txManager.run(() => repo.save(buildSubmission(TENANT_A, { ipAddress: sharedIp })));
      await txManager.run(() => repo.save(buildSubmission(TENANT_A, { ipAddress: sharedIp })));
      await txManager.run(() => repo.save(buildSubmission(TENANT_B, { ipAddress: sharedIp })));

      const countA = await repo.countByTenantAndDate(TENANT_A, date);
      const countB = await repo.countByTenantAndDate(TENANT_B, date);
      expect(countA).toBe(2);
      expect(countB).toBe(1);

      const ipCountA = await repo.countByTenantIpAndDate(TENANT_A, sharedIp, date);
      const ipCountB = await repo.countByTenantIpAndDate(TENANT_B, sharedIp, date);
      expect(ipCountA).toBe(2);
      expect(ipCountB).toBe(1);
    });

    it('countByTenantAndDate only counts rows submitted on the given UTC calendar day', async () => {
      const repo = makeRepo(new InMemoryEventBus());
      const submission = buildSubmission(TENANT_A);
      await txManager.run(() => repo.save(submission));

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const countYesterday = await repo.countByTenantAndDate(TENANT_A, yesterday);
      const countToday = await repo.countByTenantAndDate(TENANT_A, todayUTC());

      expect(countYesterday).toBe(0);
      expect(countToday).toBe(1);
    });
  });
});
