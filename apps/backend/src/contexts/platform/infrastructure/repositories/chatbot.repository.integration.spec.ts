import { Decimal } from 'decimal.js';
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
      .withCostUsd('0.00019700')
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
    expect(found!.costUsd).toEqual(new Decimal('0.000197'));
  });

  it('chatbot provider balance round-trip — upsert, save, findByProvider', async () => {
    const balance = new ChatbotProviderBalanceBuilder()
      .withProvider('openrouter-integration-test')
      .withRemainingUsd(18.42)
      .build();
    await balanceRepo.saveBalance(balance);

    const found = await balanceRepo.findByProvider('openrouter-integration-test');
    expect(found).not.toBeNull();
    expect(found!.provider).toBe('openrouter-integration-test');
    expect(found!.remainingUsd!.toNumber()).toBe(18.42);

    // A second upsert replaces the single row for the same provider — no history kept
    const refreshed = new ChatbotProviderBalanceBuilder()
      .withProvider('openrouter-integration-test')
      .withRemainingUsd(12.1)
      .build();
    await balanceRepo.saveBalance(refreshed);

    const current = await balanceRepo.findByProvider('openrouter-integration-test');
    expect(current!.remainingUsd!.toNumber()).toBe(12.1);
  });

  // M19-S06 — proves the partial-column upsert really holds against real Postgres, not just the
  // in-memory test double: two independent writers (S08's balance poll, S05/S06's health signal)
  // sharing one row by provider must never clobber each other's columns.
  describe('chatbot provider balance — partial-column write discipline (M19-S06)', () => {
    it('recordCallOutcome does not clobber an existing balance row written by saveBalance', async () => {
      await balanceRepo.saveBalance(
        new ChatbotProviderBalanceBuilder()
          .withProvider('openrouter-partial-write-test')
          .withRemainingUsd(9.99)
          .build(),
      );

      await balanceRepo.recordCallOutcome('openrouter-partial-write-test', 'SUCCESS', new Date());

      const found = await balanceRepo.findByProvider('openrouter-partial-write-test');
      expect(found!.remainingUsd!.toNumber()).toBe(9.99);
      expect(found!.lastSuccessAt).toBeInstanceOf(Date);
    });

    it('saveBalance does not clobber existing health columns written by recordCallOutcome', async () => {
      await balanceRepo.recordCallOutcome('anthropic-partial-write-test', 'FAILURE', new Date());

      await balanceRepo.saveBalance(
        new ChatbotProviderBalanceBuilder()
          .withProvider('anthropic-partial-write-test')
          .withRemainingUsd(5)
          .build(),
      );

      const found = await balanceRepo.findByProvider('anthropic-partial-write-test');
      expect(found!.remainingUsd!.toNumber()).toBe(5);
      expect(found!.lastFailureAt).toBeInstanceOf(Date);
    });

    it('recordCallOutcome creates a health-only row (no balance) for a provider that has never been polled', async () => {
      await balanceRepo.recordCallOutcome('openai-health-only-test', 'SUCCESS', new Date());

      const found = await balanceRepo.findByProvider('openai-health-only-test');
      expect(found!.remainingUsd).toBeNull();
      expect(found!.checkedAt).toBeNull();
      expect(found!.lastSuccessAt).toBeInstanceOf(Date);
    });

    it('a later failure overwrites an earlier success on the same provider row, and vice versa', async () => {
      await balanceRepo.recordCallOutcome('openrouter-overwrite-test', 'SUCCESS', new Date());
      await balanceRepo.recordCallOutcome('openrouter-overwrite-test', 'FAILURE', new Date());

      const found = await balanceRepo.findByProvider('openrouter-overwrite-test');
      expect(found!.lastFailureAt).toBeInstanceOf(Date);
      // The success column is untouched by the later failure write — its own separate column —
      // still holding the first call's timestamp, not null and not overwritten.
      expect(found!.lastSuccessAt).toBeInstanceOf(Date);
    });

    // Two concurrent requests can race so that the chronologically-older outcome's write reaches
    // Postgres second. A plain EXCLUDED-based upsert would let it clobber the newer timestamp,
    // corrupting isHealthy()'s cooldown logic. GREATEST() in the upsert's DO UPDATE SET must
    // reject the older write regardless of arrival order.
    it('an out-of-order write never overwrites a newer timestamp with an older one', async () => {
      const older = new Date('2026-08-01T10:00:00.000Z');
      const newer = new Date('2026-08-01T10:05:00.000Z');

      await balanceRepo.recordCallOutcome('openrouter-out-of-order-test', 'FAILURE', newer);
      await balanceRepo.recordCallOutcome('openrouter-out-of-order-test', 'FAILURE', older);

      const found = await balanceRepo.findByProvider('openrouter-out-of-order-test');
      expect(found!.lastFailureAt!.toISOString()).toBe(newer.toISOString());
    });
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

  // M19-S05's cap-query method extensions — real Postgres COUNT/SUM, not the in-memory fakes.
  describe('cap-enforcement query methods (M19-S05)', () => {
    it('countByTenantAndDate counts only this tenant, this date', async () => {
      const tenant = new TenantBuilder().withSlug('lavacar-count-daily').build();
      await tenantRepo.save(tenant);
      const otherTenant = new TenantBuilder().withSlug('lavacar-count-daily-other').build();
      await tenantRepo.save(otherTenant);

      await sessionRepo.save(
        new ChatbotSessionBuilder()
          .withTenantId(tenant.id)
          .withConversationDate('2026-08-01')
          .build(),
      );
      await sessionRepo.save(
        new ChatbotSessionBuilder()
          .withTenantId(tenant.id)
          .withConversationDate('2026-08-01')
          .build(),
      );
      // Different date — must not count
      await sessionRepo.save(
        new ChatbotSessionBuilder()
          .withTenantId(tenant.id)
          .withConversationDate('2026-08-02')
          .build(),
      );
      // Different tenant, same date — must not count
      await sessionRepo.save(
        new ChatbotSessionBuilder()
          .withTenantId(otherTenant.id)
          .withConversationDate('2026-08-01')
          .build(),
      );

      const count = await sessionRepo.countByTenantAndDate(tenant.id, '2026-08-01');
      expect(count).toBe(2);
    });

    it('countByTenantIpAndDate adds the client_ip filter on top of tenant+date', async () => {
      const tenant = new TenantBuilder().withSlug('lavacar-count-ip').build();
      await tenantRepo.save(tenant);

      await sessionRepo.save(
        new ChatbotSessionBuilder()
          .withTenantId(tenant.id)
          .withClientIp('198.51.100.1')
          .withConversationDate('2026-08-01')
          .build(),
      );
      await sessionRepo.save(
        new ChatbotSessionBuilder()
          .withTenantId(tenant.id)
          .withClientIp('198.51.100.2')
          .withConversationDate('2026-08-01')
          .build(),
      );

      const count = await sessionRepo.countByTenantIpAndDate(
        tenant.id,
        '198.51.100.1',
        '2026-08-01',
      );
      expect(count).toBe(1);
    });

    it('countActiveSince counts only ACTIVE sessions with last_message_at after the cutoff', async () => {
      const tenant = new TenantBuilder().withSlug('lavacar-count-active').build();
      await tenantRepo.save(tenant);

      const active = new ChatbotSessionBuilder().withTenantId(tenant.id).build();
      await sessionRepo.save(active);
      const closed = new ChatbotSessionBuilder().withTenantId(tenant.id).build();
      closed.close();
      await sessionRepo.save(closed);

      const since = new Date(Date.now() - 2 * 60 * 1000);
      const count = await sessionRepo.countActiveSince(tenant.id, since);
      expect(count).toBe(1);
    });

    it("findBySession returns a tenant-scoped session's messages ordered oldest first", async () => {
      const tenant = new TenantBuilder().withSlug('lavacar-find-by-session').build();
      await tenantRepo.save(tenant);
      const session = new ChatbotSessionBuilder().withTenantId(tenant.id).build();
      await sessionRepo.save(session);

      await messageRepo.save(
        new ChatbotMessageBuilder()
          .withTenantId(tenant.id)
          .withSessionId(session.id)
          .withContent('first')
          .build(),
      );
      await messageRepo.save(
        new ChatbotMessageBuilder()
          .withTenantId(tenant.id)
          .withSessionId(session.id)
          .withContent('second')
          .build(),
      );

      const messages = await messageRepo.findBySession(session.id, tenant.id);
      expect(messages.map((m) => m.content)).toEqual(['first', 'second']);
    });

    it('findRecentBySession returns only the last N messages, ordered oldest first (PR #360 review — SQL LIMIT, not fetch-all-then-slice)', async () => {
      const tenant = new TenantBuilder().withSlug('lavacar-find-recent-session').build();
      await tenantRepo.save(tenant);
      const session = new ChatbotSessionBuilder().withTenantId(tenant.id).build();
      await sessionRepo.save(session);

      for (let i = 0; i < 5; i++) {
        await messageRepo.save(
          new ChatbotMessageBuilder()
            .withTenantId(tenant.id)
            .withSessionId(session.id)
            .withContent(`message ${i}`)
            .build(),
        );
      }

      const recent = await messageRepo.findRecentBySession(session.id, tenant.id, 2);
      expect(recent.map((m) => m.content)).toEqual(['message 3', 'message 4']);
    });

    // sumCostUsdSince is deliberately platform-wide, not tenant-scoped (docs/discovery/CHATBOT/CHATBOT.md
    // §8's global spend breaker) — so `since` is captured narrowly, right before this test's own
    // inserts, rather than an arbitrary window. Capturing it any earlier would pick up cost from
    // whichever other test in this file happened to run first, making the exact-sum assertion flaky.
    it('sumCostUsdSince sums cost_usd across every tenant, from `since` onward', async () => {
      const tenant = new TenantBuilder().withSlug('lavacar-sum-cost').build();
      await tenantRepo.save(tenant);
      const session = new ChatbotSessionBuilder().withTenantId(tenant.id).build();
      await sessionRepo.save(session);
      const otherTenant = new TenantBuilder().withSlug('lavacar-sum-cost-other').build();
      await tenantRepo.save(otherTenant);
      const otherSession = new ChatbotSessionBuilder().withTenantId(otherTenant.id).build();
      await sessionRepo.save(otherSession);

      const since = new Date();
      await messageRepo.save(
        new ChatbotMessageBuilder()
          .withTenantId(tenant.id)
          .withSessionId(session.id)
          .withCostUsd('0.001')
          .build(),
      );
      await messageRepo.save(
        new ChatbotMessageBuilder()
          .withTenantId(otherTenant.id)
          .withSessionId(otherSession.id)
          .withCostUsd('0.002')
          .build(),
      );

      const total = await messageRepo.sumCostUsdSince(since);
      expect(total.toString()).toBe('0.003');
    });

    it('sumCostUsdSince excludes messages created before `since`', async () => {
      const tenant = new TenantBuilder().withSlug('lavacar-sum-cost-cutoff').build();
      await tenantRepo.save(tenant);
      const session = new ChatbotSessionBuilder().withTenantId(tenant.id).build();
      await sessionRepo.save(session);
      await messageRepo.save(
        new ChatbotMessageBuilder()
          .withTenantId(tenant.id)
          .withSessionId(session.id)
          .withCostUsd('0.005')
          .build(),
      );

      const since = new Date(Date.now() + 1000);
      const total = await messageRepo.sumCostUsdSince(since);
      expect(total.toString()).toBe('0');
    });
  });
});
