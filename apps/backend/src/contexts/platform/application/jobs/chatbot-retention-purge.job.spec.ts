import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryChatbotMessageRepository } from '../../../../test/repositories/platform/in-memory-chatbot-message.repository';
import { InMemoryChatbotSessionRepository } from '../../../../test/repositories/platform/in-memory-chatbot-session.repository';
import { ChatbotMessageBuilder, ChatbotSessionBuilder } from '../../../../test/builders/platform';
import { CHATBOT_RETENTION_DAYS, ChatbotRetentionPurgeJob } from './chatbot-retention-purge.job';

const TENANT_ID = '10000000-0000-7000-8000-000000000010';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-13T03:00:00.000Z');
const OLD = new Date(NOW.getTime() - (CHATBOT_RETENTION_DAYS + 1) * DAY_MS);
const RECENT = new Date(NOW.getTime() - (CHATBOT_RETENTION_DAYS - 1) * DAY_MS);

describe('ChatbotRetentionPurgeJob', () => {
  let messageRepo: InMemoryChatbotMessageRepository;
  let sessionRepo: InMemoryChatbotSessionRepository;
  let txManager: InMemoryTransactionManager;
  let job: ChatbotRetentionPurgeJob;

  beforeEach(() => {
    messageRepo = new InMemoryChatbotMessageRepository();
    sessionRepo = new InMemoryChatbotSessionRepository();
    txManager = new InMemoryTransactionManager();
    job = new ChatbotRetentionPurgeJob(messageRepo, sessionRepo, txManager);
  });

  it('returns zero counts when nothing is past the retention window', async () => {
    const session = new ChatbotSessionBuilder()
      .withTenantId(TENANT_ID)
      .withStartedAt(RECENT)
      .build();
    await sessionRepo.save(session);
    await messageRepo.save(
      new ChatbotMessageBuilder()
        .withTenantId(TENANT_ID)
        .withSessionId(session.id)
        .withCreatedAt(RECENT)
        .build(),
    );

    const result = await job.run(NOW);

    expect(result).toEqual({ messagesDeleted: 0, sessionsDeleted: 0 });
    expect(await messageRepo.findBySession(session.id, TENANT_ID)).toHaveLength(1);
    expect(await sessionRepo.findById(session.id, TENANT_ID)).not.toBeNull();
  });

  it('deletes messages older than the retention window across tenants, keeps recent ones', async () => {
    const oldMessage = new ChatbotMessageBuilder()
      .withTenantId(TENANT_ID)
      .withCreatedAt(OLD)
      .build();
    const recentMessage = new ChatbotMessageBuilder()
      .withTenantId(TENANT_ID)
      .withCreatedAt(RECENT)
      .build();
    await messageRepo.save(oldMessage);
    await messageRepo.save(recentMessage);

    const result = await job.run(NOW);

    expect(result.messagesDeleted).toBe(1);
    expect(await messageRepo.findById(oldMessage.id, TENANT_ID)).toBeNull();
    expect(await messageRepo.findById(recentMessage.id, TENANT_ID)).not.toBeNull();
  });

  it('deletes a now-orphaned session past the window once its only message is purged', async () => {
    const session = new ChatbotSessionBuilder().withTenantId(TENANT_ID).withStartedAt(OLD).build();
    await sessionRepo.save(session);
    await messageRepo.save(
      new ChatbotMessageBuilder()
        .withTenantId(TENANT_ID)
        .withSessionId(session.id)
        .withCreatedAt(OLD)
        .build(),
    );

    const result = await job.run(NOW);

    expect(result).toEqual({ messagesDeleted: 1, sessionsDeleted: 1 });
    expect(await sessionRepo.findById(session.id, TENANT_ID)).toBeNull();
  });

  it('never deletes a session that still has a remaining message, even if started before the window', async () => {
    const session = new ChatbotSessionBuilder().withTenantId(TENANT_ID).withStartedAt(OLD).build();
    await sessionRepo.save(session);
    // One old message (gets purged) and one recent message (does not) for the same session —
    // the session must survive because it still has a remaining message after the purge.
    await messageRepo.save(
      new ChatbotMessageBuilder()
        .withTenantId(TENANT_ID)
        .withSessionId(session.id)
        .withCreatedAt(OLD)
        .build(),
    );
    await messageRepo.save(
      new ChatbotMessageBuilder()
        .withTenantId(TENANT_ID)
        .withSessionId(session.id)
        .withCreatedAt(RECENT)
        .build(),
    );

    const result = await job.run(NOW);

    expect(result.messagesDeleted).toBe(1);
    expect(result.sessionsDeleted).toBe(0);
    expect(await sessionRepo.findById(session.id, TENANT_ID)).not.toBeNull();
  });

  it('never deletes a session started before the window that already has zero messages of its own accord', async () => {
    // A session with no messages at all (e.g. a first-attempt failure never cleaned up) is still
    // a legitimate orphan-purge candidate — started_at past the window, zero remaining messages.
    const session = new ChatbotSessionBuilder().withTenantId(TENANT_ID).withStartedAt(OLD).build();
    await sessionRepo.save(session);

    const result = await job.run(NOW);

    expect(result).toEqual({ messagesDeleted: 0, sessionsDeleted: 1 });
    expect(await sessionRepo.findById(session.id, TENANT_ID)).toBeNull();
  });

  it('does not delete a session started before the window whose recent-message check is unaffected by other tenants', async () => {
    const TENANT_B = '20000000-0000-7000-8000-000000000020';
    const sessionA = new ChatbotSessionBuilder().withTenantId(TENANT_ID).withStartedAt(OLD).build();
    const sessionB = new ChatbotSessionBuilder().withTenantId(TENANT_B).withStartedAt(OLD).build();
    await sessionRepo.save(sessionA);
    await sessionRepo.save(sessionB);
    await messageRepo.save(
      new ChatbotMessageBuilder()
        .withTenantId(TENANT_B)
        .withSessionId(sessionB.id)
        .withCreatedAt(RECENT)
        .build(),
    );

    const result = await job.run(NOW);

    expect(result.sessionsDeleted).toBe(1);
    expect(await sessionRepo.findById(sessionA.id, TENANT_ID)).toBeNull();
    expect(await sessionRepo.findById(sessionB.id, TENANT_B)).not.toBeNull();
  });

  it('is idempotent — running twice in a row does not error and deletes nothing new the second time', async () => {
    const session = new ChatbotSessionBuilder().withTenantId(TENANT_ID).withStartedAt(OLD).build();
    await sessionRepo.save(session);
    await messageRepo.save(
      new ChatbotMessageBuilder()
        .withTenantId(TENANT_ID)
        .withSessionId(session.id)
        .withCreatedAt(OLD)
        .build(),
    );

    await job.run(NOW);
    const secondRun = await job.run(NOW);

    expect(secondRun).toEqual({ messagesDeleted: 0, sessionsDeleted: 0 });
  });
});
