import { DataSource, Repository } from 'typeorm';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { makeConfigService } from '../../../../test/infrastructure/fake-config-service';
import { createTestDataSource } from '../../../../test/test-datasource';
import { LeadFormSubmissionBuilder, TenantBuilder } from '../../../../test/builders/platform';
import { OutboxEventEntity } from '../../../../shared/infrastructure/outbox/outbox-event.entity';
import { OutboxPublisher } from '../../../../shared/infrastructure/outbox/outbox-publisher';
import { OutboxRelayService } from '../../../../shared/infrastructure/outbox/outbox-relay.service';
import { TypeOrmOutboxRepository } from '../../../../shared/infrastructure/outbox/typeorm-outbox.repository';
import { LeadFormSubmissionEntity } from '../../infrastructure/entities/lead-form-submission.entity';
import { TenantEntity } from '../../infrastructure/entities/tenant.entity';
import { TypeOrmLeadFormSubmissionRepository } from '../../infrastructure/repositories/typeorm-lead-form-submission.repository';
import { TypeOrmTenantRepository } from '../../infrastructure/repositories/typeorm-tenant.repository';
import { LeadFormRetentionPurgeJob } from './lead-form-retention-purge.job';

const NOW = new Date();
const BEFORE_CUTOFF = new Date(NOW.getTime() - 1000);
const AFTER_CUTOFF = new Date(NOW.getTime() + 60 * 60 * 1000);

// UC-043 (M20-S04): proves the real-DB deletion behavior against a real Postgres instance —
// the (tenant_id, expires_at) index and cross-tenant scan can't be exercised meaningfully by
// the in-memory repo's unit spec alone. Mirrors chatbot-retention-purge.job.integration.spec.ts.
describe('LeadFormRetentionPurgeJob (integration)', () => {
  let dataSource: DataSource;
  let tenantRepo: TypeOrmTenantRepository;
  let submissionRepo: TypeOrmLeadFormSubmissionRepository;
  let entityRepo: Repository<LeadFormSubmissionEntity>;
  let job: LeadFormRetentionPurgeJob;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    tenantRepo = new TypeOrmTenantRepository(
      dataSource.getRepository(TenantEntity),
      new InMemoryEventBus(),
    );
    entityRepo = dataSource.getRepository(LeadFormSubmissionEntity);

    const outboxRepo = dataSource.getRepository(OutboxEventEntity);
    const typeOrmOutboxRepo = new TypeOrmOutboxRepository(outboxRepo);
    const txManagerForOutbox = new TypeOrmTransactionManager(dataSource);
    const config = makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: false });
    const relay = new OutboxRelayService(
      typeOrmOutboxRepo,
      new InMemoryEventBus(),
      new InMemoryInboxRepository(),
      config,
      txManagerForOutbox,
    );
    const outboxPublisher = new OutboxPublisher(typeOrmOutboxRepo, relay, config);
    submissionRepo = new TypeOrmLeadFormSubmissionRepository(
      dataSource.getRepository(LeadFormSubmissionEntity),
      outboxPublisher,
    );

    job = new LeadFormRetentionPurgeJob(submissionRepo, new TypeOrmTransactionManager(dataSource));
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  function buildSubmission(tenantId: string, expiresAt: Date) {
    return new LeadFormSubmissionBuilder().withTenantId(tenantId).withExpiresAt(expiresAt).build();
  }

  it('deletes expired submissions across two different tenants in one pass, keeping unexpired ones', async () => {
    const tenantA = new TenantBuilder()
      .withName('Lead Form Retention Tenant A')
      .withSlug('lead-form-retention-tenant-a')
      .build();
    const tenantB = new TenantBuilder()
      .withName('Lead Form Retention Tenant B')
      .withSlug('lead-form-retention-tenant-b')
      .build();
    await tenantRepo.save(tenantA);
    await tenantRepo.save(tenantB);

    const expiredA = buildSubmission(tenantA.id, BEFORE_CUTOFF);
    const expiredB = buildSubmission(tenantB.id, BEFORE_CUTOFF);
    const keptA = buildSubmission(tenantA.id, AFTER_CUTOFF);
    await submissionRepo.save(expiredA);
    await submissionRepo.save(expiredB);
    await submissionRepo.save(keptA);

    const result = await job.run(NOW);

    expect(result.submissionsDeleted).toBe(2);
    expect(await entityRepo.findOne({ where: { id: expiredA.id } })).toBeNull();
    expect(await entityRepo.findOne({ where: { id: expiredB.id } })).toBeNull();
    expect(await entityRepo.findOne({ where: { id: keptA.id } })).not.toBeNull();
  });

  it('is idempotent — running twice in a row deletes nothing new the second time', async () => {
    const tenant = new TenantBuilder()
      .withName('Lead Form Retention Idempotent')
      .withSlug('lead-form-retention-idempotent')
      .build();
    await tenantRepo.save(tenant);

    await submissionRepo.save(buildSubmission(tenant.id, BEFORE_CUTOFF));

    const firstRun = await job.run(NOW);
    const secondRun = await job.run(NOW);

    expect(firstRun.submissionsDeleted).toBe(1);
    expect(secondRun.submissionsDeleted).toBe(0);
  });
});
