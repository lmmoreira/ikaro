import { DataSource } from 'typeorm';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { createTestDataSource } from '../../../../test/test-datasource';
import {
  ChatbotMessageBuilder,
  ChatbotSessionBuilder,
  TenantBuilder,
} from '../../../../test/builders/platform';
import { ChatbotMessageEntity } from '../../infrastructure/entities/chatbot-message.entity';
import { ChatbotSessionEntity } from '../../infrastructure/entities/chatbot-session.entity';
import { TenantEntity } from '../../infrastructure/entities/tenant.entity';
import { TypeOrmChatbotMessageRepository } from '../../infrastructure/repositories/typeorm-chatbot-message.repository';
import { TypeOrmChatbotSessionRepository } from '../../infrastructure/repositories/typeorm-chatbot-session.repository';
import { TypeOrmTenantRepository } from '../../infrastructure/repositories/typeorm-tenant.repository';
import { CHATBOT_RETENTION_DAYS, ChatbotRetentionPurgeJob } from './chatbot-retention-purge.job';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date();
const OLD = new Date(NOW.getTime() - (CHATBOT_RETENTION_DAYS + 1) * DAY_MS);
const RECENT = new Date(NOW.getTime() - (CHATBOT_RETENTION_DAYS - 1) * DAY_MS);

// UC-035 (M19-S07): proves both real-DB deletion behaviors against a real Postgres instance —
// the composite FK + NOT-EXISTS-style orphan check (implemented here as a job-level re-read,
// see chatbot-retention-purge.job.ts) can't be exercised meaningfully by the in-memory repos'
// unit spec alone.
describe('ChatbotRetentionPurgeJob (integration)', () => {
  let dataSource: DataSource;
  let tenantRepo: TypeOrmTenantRepository;
  let sessionRepo: TypeOrmChatbotSessionRepository;
  let messageRepo: TypeOrmChatbotMessageRepository;
  let job: ChatbotRetentionPurgeJob;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    tenantRepo = new TypeOrmTenantRepository(
      dataSource.getRepository(TenantEntity),
      new InMemoryEventBus(),
    );
    sessionRepo = new TypeOrmChatbotSessionRepository(
      dataSource.getRepository(ChatbotSessionEntity),
    );
    messageRepo = new TypeOrmChatbotMessageRepository(
      dataSource.getRepository(ChatbotMessageEntity),
    );
    job = new ChatbotRetentionPurgeJob(
      messageRepo,
      sessionRepo,
      new TypeOrmTransactionManager(dataSource),
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('deletes messages and now-orphaned sessions past the window, across two different tenants in one pass', async () => {
    const tenantA = new TenantBuilder()
      .withName('Retention Purge Tenant A')
      .withSlug('retention-purge-tenant-a')
      .build();
    const tenantB = new TenantBuilder()
      .withName('Retention Purge Tenant B')
      .withSlug('retention-purge-tenant-b')
      .build();
    await tenantRepo.save(tenantA);
    await tenantRepo.save(tenantB);

    const sessionA = new ChatbotSessionBuilder()
      .withTenantId(tenantA.id)
      .withStartedAt(OLD)
      .build();
    const sessionB = new ChatbotSessionBuilder()
      .withTenantId(tenantB.id)
      .withStartedAt(OLD)
      .build();
    await sessionRepo.save(sessionA);
    await sessionRepo.save(sessionB);

    const oldMessageA = new ChatbotMessageBuilder()
      .withTenantId(tenantA.id)
      .withSessionId(sessionA.id)
      .withCreatedAt(OLD)
      .build();
    const oldMessageB = new ChatbotMessageBuilder()
      .withTenantId(tenantB.id)
      .withSessionId(sessionB.id)
      .withCreatedAt(OLD)
      .build();
    await messageRepo.save(oldMessageA);
    await messageRepo.save(oldMessageB);

    const result = await job.run(NOW);

    expect(result.messagesDeleted).toBeGreaterThanOrEqual(2);
    expect(result.sessionsDeleted).toBeGreaterThanOrEqual(2);
    expect(await messageRepo.findById(oldMessageA.id, tenantA.id)).toBeNull();
    expect(await messageRepo.findById(oldMessageB.id, tenantB.id)).toBeNull();
    expect(await sessionRepo.findById(sessionA.id, tenantA.id)).toBeNull();
    expect(await sessionRepo.findById(sessionB.id, tenantB.id)).toBeNull();
  });

  it('never deletes a session past the window that still has a remaining message', async () => {
    const tenant = new TenantBuilder()
      .withName('Retention Purge Keep Session')
      .withSlug('retention-purge-keep-session')
      .build();
    await tenantRepo.save(tenant);

    const session = new ChatbotSessionBuilder().withTenantId(tenant.id).withStartedAt(OLD).build();
    await sessionRepo.save(session);
    const oldMessage = new ChatbotMessageBuilder()
      .withTenantId(tenant.id)
      .withSessionId(session.id)
      .withCreatedAt(OLD)
      .build();
    const recentMessage = new ChatbotMessageBuilder()
      .withTenantId(tenant.id)
      .withSessionId(session.id)
      .withCreatedAt(RECENT)
      .build();
    await messageRepo.save(oldMessage);
    await messageRepo.save(recentMessage);

    await job.run(NOW);

    expect(await messageRepo.findById(oldMessage.id, tenant.id)).toBeNull();
    expect(await messageRepo.findById(recentMessage.id, tenant.id)).not.toBeNull();
    expect(await sessionRepo.findById(session.id, tenant.id)).not.toBeNull();
  });

  it('is idempotent — running twice in a row deletes nothing new the second time', async () => {
    const tenant = new TenantBuilder()
      .withName('Retention Purge Idempotent')
      .withSlug('retention-purge-idempotent')
      .build();
    await tenantRepo.save(tenant);

    const session = new ChatbotSessionBuilder().withTenantId(tenant.id).withStartedAt(OLD).build();
    await sessionRepo.save(session);
    await messageRepo.save(
      new ChatbotMessageBuilder()
        .withTenantId(tenant.id)
        .withSessionId(session.id)
        .withCreatedAt(OLD)
        .build(),
    );

    const firstRun = await job.run(NOW);
    const secondRun = await job.run(NOW);

    expect(firstRun).toEqual({ messagesDeleted: 1, sessionsDeleted: 1 });
    expect(secondRun).toEqual({ messagesDeleted: 0, sessionsDeleted: 0 });
  });
});
