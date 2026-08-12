import { INestApplication } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TENANT_SETTINGS_PORT } from '../../../../shared/ports/tenant-settings.port';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { createPlatformIntegrationApp } from '../../../../test/utils/platform-integration-app';
import { TenantBuilder } from '../../../../test/builders/platform';
import { TenantSettings } from '../../domain/value-objects/tenant-settings.vo';
import { OPENROUTER_LLM_PROVIDER } from '../../application/ports/llm-provider.port';
import {
  ChatCompletionRequest,
  ChatCompletionResult,
  ILlmProvider,
} from '../../application/ports/llm-provider.port';
import { ChatbotProviderBalanceEntity } from '../entities/chatbot-provider-balance.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { TypeOrmTenantRepository } from '../repositories/typeorm-tenant.repository';

// Switchable so the same real app instance can prove both the happy-path health-write and the
// failure-path health-write, plus recovery, without paying to bootstrap a second Postgres schema.
class SwitchableLlmProvider implements ILlmProvider {
  mode: 'success' | 'failure' = 'success';

  async complete(_request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    if (this.mode === 'failure') throw new Error('Simulated provider outage');
    return {
      text: 'Fake LLM response',
      inputTokens: 10,
      outputTokens: 5,
      modelId: 'fake-model',
      costUsd: new Decimal('0.00001'),
    };
  }
}

// Real HTTP request -> real controller -> real use case -> real Postgres, with only the LLM call
// itself stubbed. Proves the wiring the layered unit/integration specs can't: real
// ZodValidationPipe behavior, real RequestContext population from headers, real mapPlatformError
// -> HTTP status mapping, and that POST /messages and GET /status agree on the same underlying
// DB state (docs/08-TESTING_STRATEGY.md Layer 3 explicitly scopes "REST controllers").
describe('ChatbotController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantRepo: TypeOrmTenantRepository;
  let settingsPort: InMemoryTenantSettingsPort;
  let llmProvider: SwitchableLlmProvider;
  let tenantCounter = 0;

  beforeAll(async () => {
    llmProvider = new SwitchableLlmProvider();
    settingsPort = new InMemoryTenantSettingsPort();
    ({ app, ds } = await createPlatformIntegrationApp({
      overrideProviders: [
        { provide: OPENROUTER_LLM_PROVIDER, useValue: llmProvider },
        { provide: TENANT_SETTINGS_PORT, useValue: settingsPort },
      ],
    }));
    tenantRepo = new TypeOrmTenantRepository(
      ds.getRepository(TenantEntity),
      new InMemoryEventBus(),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    llmProvider.mode = 'success';
    // chatbot_provider_balance is platform-wide, not tenant-scoped (by design — see
    // docs/13-DATABASE_SCHEMA.md) — a prior test's simulated outage on 'openrouter' would
    // otherwise leak into every later test's health check via the same shared row. Truncate
    // (not drop) between tests, matching docs/08-TESTING_STRATEGY.md's Layer 3 convention.
    await ds.query('TRUNCATE platform.chatbot_provider_balance');
  });

  async function provisionTenant(chatbotOverrides: Record<string, unknown> = {}): Promise<string> {
    tenantCounter += 1;
    const tenant = new TenantBuilder().withSlug(`chatbot-controller-test-${tenantCounter}`).build();
    await tenantRepo.save(tenant);
    const defaults = TenantSettings.default().toJSON();
    settingsPort.set(tenant.id, {
      ...defaults,
      chatbot: { ...defaults.chatbot, ...chatbotOverrides },
    });
    return tenant.id;
  }

  function guestHeaders(tenantId: string): Record<string, string> {
    return { 'x-tenant-id': tenantId, 'x-correlation-id': 'test-correlation-id' };
  }

  describe('POST /platform/chatbot/messages', () => {
    it('returns 200 with sessionId/reply and records a health success on the resolved provider', async () => {
      const tenantId = await provisionTenant();

      const { body } = await request(app.getHttpServer())
        .post('/platform/chatbot/messages')
        .set(guestHeaders(tenantId))
        .send({
          systemPrompt: 'You are a helpful assistant.',
          message: 'Vocês trabalham aos sábados?',
          clientIp: '203.0.113.10',
        })
        .expect(200);

      expect(body.sessionId).toBeDefined();
      expect(body.reply).toBe('Fake LLM response');

      const balanceRow = await ds
        .getRepository(ChatbotProviderBalanceEntity)
        .findOne({ where: { provider: 'openrouter' } });
      expect(balanceRow?.lastSuccessAt).toBeInstanceOf(Date);
    });

    it('returns 429 once the tenant-overridden daily cap is reached, without touching the health signal', async () => {
      const tenantId = await provisionTenant({ maxConversationsPerDay: 1 });

      await request(app.getHttpServer())
        .post('/platform/chatbot/messages')
        .set(guestHeaders(tenantId))
        .send({ systemPrompt: 'p', message: 'first', clientIp: '203.0.113.20' })
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .post('/platform/chatbot/messages')
        .set(guestHeaders(tenantId))
        .send({ systemPrompt: 'p', message: 'second', clientIp: '203.0.113.21' })
        .expect(429);

      expect(body.code).toBe('PLATFORM_CHATBOT_DAILY_CAP_REACHED');
    });

    it('returns 503 when the LLM call fails, and records a health failure on the resolved provider', async () => {
      const tenantId = await provisionTenant();
      llmProvider.mode = 'failure';

      const { body } = await request(app.getHttpServer())
        .post('/platform/chatbot/messages')
        .set(guestHeaders(tenantId))
        .send({ systemPrompt: 'p', message: 'oi', clientIp: '203.0.113.30' })
        .expect(503);

      expect(body.code).toBe('PLATFORM_CHATBOT_PROVIDER_UNAVAILABLE');

      const balanceRow = await ds
        .getRepository(ChatbotProviderBalanceEntity)
        .findOne({ where: { provider: 'openrouter' } });
      expect(balanceRow?.lastFailureAt).toBeInstanceOf(Date);
    });
  });

  describe('GET /platform/chatbot/status', () => {
    it('returns { available: true } when nothing is tripped', async () => {
      const tenantId = await provisionTenant();

      const { body } = await request(app.getHttpServer())
        .get('/platform/chatbot/status')
        .set(guestHeaders(tenantId))
        .expect(200);

      expect(body).toEqual({ available: true });
    });

    it("returns { available: false } once this tenant's own daily cap is reached", async () => {
      const tenantId = await provisionTenant({ maxConversationsPerDay: 1 });
      await request(app.getHttpServer())
        .post('/platform/chatbot/messages')
        .set(guestHeaders(tenantId))
        .send({ systemPrompt: 'p', message: 'oi', clientIp: '203.0.113.40' })
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .get('/platform/chatbot/status')
        .set(guestHeaders(tenantId))
        .expect(200);

      expect(body).toEqual({ available: false });
    });

    it("does not let tenant A's daily cap affect tenant B's status", async () => {
      const tenantA = await provisionTenant({ maxConversationsPerDay: 1 });
      const tenantB = await provisionTenant();
      await request(app.getHttpServer())
        .post('/platform/chatbot/messages')
        .set(guestHeaders(tenantA))
        .send({ systemPrompt: 'p', message: 'oi', clientIp: '203.0.113.50' })
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .get('/platform/chatbot/status')
        .set(guestHeaders(tenantB))
        .expect(200);

      expect(body).toEqual({ available: true });
    });
  });

  describe('combined — a real provider outage flips status, and a real recovery clears it', () => {
    it('status flips to unavailable after a real 503, and back to available after a real recovery', async () => {
      const tenantId = await provisionTenant();

      await request(app.getHttpServer())
        .get('/platform/chatbot/status')
        .set(guestHeaders(tenantId))
        .expect(200)
        .expect(({ body }) => expect(body).toEqual({ available: true }));

      llmProvider.mode = 'failure';
      await request(app.getHttpServer())
        .post('/platform/chatbot/messages')
        .set(guestHeaders(tenantId))
        .send({ systemPrompt: 'p', message: 'oi', clientIp: '203.0.113.60' })
        .expect(503);

      await request(app.getHttpServer())
        .get('/platform/chatbot/status')
        .set(guestHeaders(tenantId))
        .expect(200)
        .expect(({ body }) => expect(body).toEqual({ available: false }));

      // Health-only cooldown default is 5 minutes — a real subsequent success is what actually
      // clears it (docs/13-DATABASE_SCHEMA.md's half-open rule), not time passing in this test.
      llmProvider.mode = 'success';
      await request(app.getHttpServer())
        .post('/platform/chatbot/messages')
        .set(guestHeaders(tenantId))
        .send({ systemPrompt: 'p', message: 'oi de novo', clientIp: '203.0.113.60' })
        .expect(200);

      await request(app.getHttpServer())
        .get('/platform/chatbot/status')
        .set(guestHeaders(tenantId))
        .expect(200)
        .expect(({ body }) => expect(body).toEqual({ available: true }));
    });
  });
});
