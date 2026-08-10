import { DataSource, QueryFailedError } from 'typeorm';
import { createTestDataSource } from '../../../../test/test-datasource';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import {
  ChatbotSessionBuilder,
  ChatbotMessageBuilder,
  ChatbotProviderBalanceBuilder,
  TenantBuilder,
} from '../../../../test/builders/platform';
import { ChatbotSessionEntity } from '../entities/chatbot-session.entity';
import { ChatbotMessageEntity } from '../entities/chatbot-message.entity';
import { ChatbotProviderBalanceEntity } from '../entities/chatbot-provider-balance.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { TypeOrmChatbotSessionRepository } from './typeorm-chatbot-session.repository';
import { TypeOrmChatbotMessageRepository } from './typeorm-chatbot-message.repository';
import { TypeOrmChatbotProviderBalanceRepository } from './typeorm-chatbot-provider-balance.repository';
import { TypeOrmTenantRepository } from './typeorm-tenant.repository';

describe('Chatbot repositories (integration)', () => {
  let dataSource: DataSource;
  let tenantRepo: TypeOrmTenantRepository;
  let sessionRepo: TypeOrmChatbotSessionRepository;
  let messageRepo: TypeOrmChatbotMessageRepository;
  let balanceRepo: TypeOrmChatbotProviderBalanceRepository;

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
    balanceRepo = new TypeOrmChatbotProviderBalanceRepository(
      dataSource.getRepository(ChatbotProviderBalanceEntity),
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('chatbot session round-trip — create, save, findById', async () => {
    const tenant = new TenantBuilder()
      .withName('Lavacar Chatbot')
      .withSlug('lavacar-chatbot-session')
      .build();
    await tenantRepo.save(tenant);

    const session = new ChatbotSessionBuilder()
      .withTenantId(tenant.id)
      .withClientIp('198.51.100.20')
      .withConversationDate('2026-08-09')
      .build();
    await sessionRepo.save(session);

    const found = await sessionRepo.findById(session.id, tenant.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(session.id);
    expect(found!.tenantId).toBe(tenant.id);
    expect(found!.clientIp).toBe('198.51.100.20');
    expect(found!.conversationDate).toBe('2026-08-09');
    expect(found!.status).toBe('ACTIVE');
    expect(found!.messageCount).toBe(0);

    // Mutate and persist state transitions
    session.recordMessage();
    session.markCapped();
    await sessionRepo.save(session);

    const updated = await sessionRepo.findById(session.id, tenant.id);
    expect(updated!.messageCount).toBe(1);
    expect(updated!.status).toBe('CAPPED');
  });

  it('chatbot message round-trip — create, save, findById', async () => {
    const tenant = new TenantBuilder()
      .withName('Lavacar Chatbot Message')
      .withSlug('lavacar-chatbot-message')
      .build();
    await tenantRepo.save(tenant);

    const session = new ChatbotSessionBuilder().withTenantId(tenant.id).build();
    await sessionRepo.save(session);

    const message = new ChatbotMessageBuilder()
      .withTenantId(tenant.id)
      .withSessionId(session.id)
      .withRole('ASSISTANT')
      .withContent('Funcionamos de segunda a sábado, das 8h às 18h.')
      .withInputTokens(120)
      .withOutputTokens(35)
      .build();
    await messageRepo.save(message);

    const found = await messageRepo.findById(message.id, tenant.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(message.id);
    expect(found!.sessionId).toBe(session.id);
    expect(found!.role).toBe('ASSISTANT');
    expect(found!.content).toBe('Funcionamos de segunda a sábado, das 8h às 18h.');
    expect(found!.inputTokens).toBe(120);
    expect(found!.outputTokens).toBe(35);
  });

  it('chatbot provider balance round-trip — upsert, save, findByProvider', async () => {
    const balance = new ChatbotProviderBalanceBuilder()
      .withProvider('openrouter-integration-test')
      .withRemainingUsd(18.42)
      .build();
    await balanceRepo.save(balance);

    const found = await balanceRepo.findByProvider('openrouter-integration-test');
    expect(found).not.toBeNull();
    expect(found!.provider).toBe('openrouter-integration-test');
    expect(found!.remainingUsd.toNumber()).toBe(18.42);

    // A second upsert replaces the single row for the same provider — no history kept
    const refreshed = new ChatbotProviderBalanceBuilder()
      .withProvider('openrouter-integration-test')
      .withRemainingUsd(12.1)
      .build();
    await balanceRepo.save(refreshed);

    const current = await balanceRepo.findByProvider('openrouter-integration-test');
    expect(current!.remainingUsd.toNumber()).toBe(12.1);
  });

  it('multi-tenant isolation — Tenant B cannot find Tenant A chatbot session', async () => {
    const tenantA = new TenantBuilder()
      .withName('Lavacar Alpha Chatbot')
      .withSlug('lavacar-alpha-chatbot')
      .build();
    const tenantB = new TenantBuilder()
      .withName('Lavacar Beta Chatbot')
      .withSlug('lavacar-beta-chatbot')
      .build();
    await tenantRepo.save(tenantA);
    await tenantRepo.save(tenantB);

    const sessionA = new ChatbotSessionBuilder().withTenantId(tenantA.id).build();
    await sessionRepo.save(sessionA);

    const resultForB = await sessionRepo.findById(sessionA.id, tenantB.id);
    expect(resultForB).toBeNull();

    const resultForA = await sessionRepo.findById(sessionA.id, tenantA.id);
    expect(resultForA!.id).toBe(sessionA.id);
  });

  // Proves the composite FK (tenant_id, session_id) -> chatbot_sessions(tenant_id, id) actually
  // enforces tenant isolation at the DB level, not just at the application query layer — a message
  // can never be inserted against another tenant's session, even if the session_id itself is valid.
  it('rejects a chatbot message whose session_id belongs to a different tenant', async () => {
    const tenantA = new TenantBuilder()
      .withName('Lavacar FK Alpha')
      .withSlug('lavacar-fk-alpha')
      .build();
    const tenantB = new TenantBuilder()
      .withName('Lavacar FK Beta')
      .withSlug('lavacar-fk-beta')
      .build();
    await tenantRepo.save(tenantA);
    await tenantRepo.save(tenantB);

    const sessionA = new ChatbotSessionBuilder().withTenantId(tenantA.id).build();
    await sessionRepo.save(sessionA);

    const crossTenantMessage = new ChatbotMessageBuilder()
      .withTenantId(tenantB.id)
      .withSessionId(sessionA.id)
      .build();

    const error = await messageRepo.save(crossTenantMessage).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(QueryFailedError);
    // 23503 = foreign_key_violation — confirms this is specifically the composite FK rejecting the
    // cross-tenant reference, not some other unrelated query failure.
    expect((error as QueryFailedError & { code: string }).code).toBe('23503');
  });
});
