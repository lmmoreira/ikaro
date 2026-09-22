import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { todayInSaoPaulo } from '../../../../test/utils/chatbot-test-helpers';
import {
  ChatbotSessionEntityBuilder,
  TenantEntityBuilder,
} from '../../../../test/builders/platform/index';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { TENANT_SETTINGS_PORT } from '../../../../shared/ports/tenant-settings.port';
import { TenantSettings } from '../../domain/value-objects/tenant-settings.vo';
import { ChatbotSessionEntity } from '../entities/chatbot-session.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { createPlatformIntegrationApp } from '../../../../test/utils/platform-integration-app';

const TEST_KEY = 'settings-integ-test-key-settings-xx'; // exactly 36 chars

// ChatbotSessionEntityBuilder defaults startedAt/lastMessageAt to a fixed 2026-01-01 timestamp —
// old enough to be swept by ChatbotRetentionPurgeJob's real, platform-wide (all-tenants) sweep,
// which shares this same test-run's Postgres instance with every other integration spec file.
// Force both fields to "now" so rows inserted here are never eligible for that sweep, regardless
// of file execution order (caught via chatbot-retention-purge.job.integration.spec.ts failing
// with sessionsDeleted: 33 instead of 2 — this file's own leftover rows had leaked in).
function recentSession(tenantId: string): ChatbotSessionEntity {
  const session = new ChatbotSessionEntityBuilder()
    .withTenantId(tenantId)
    .withConversationDate(todayInSaoPaulo())
    .build();
  const now = new Date();
  session.startedAt = now;
  session.lastMessageAt = now;
  return session;
}

describe('TenantSettingsController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantId: string;
  let settingsPort: InMemoryTenantSettingsPort;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    settingsPort = new InMemoryTenantSettingsPort();
    ({ app, ds } = await createPlatformIntegrationApp({
      overrideProviders: [{ provide: TENANT_SETTINGS_PORT, useValue: settingsPort }],
    }));

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', TEST_KEY)
      .send({
        name: 'Lavacar Settings Test',
        slug: 'lavacar-settings-integ-01',
        adminEmail: 'settings@test.com.br',
        country_code: 'BR',
      })
      .expect(201);

    tenantId = body.tenantId as string;
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
  });

  it('returns 200 with the tenant settings on GET', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .expect(200);

    expect(body.tenantId).toBe(tenantId);
    expect(body.slug).toBe('lavacar-settings-integ-01');
    expect(body.name).toBe('Lavacar Settings Test');
    expect(body.settings.loyalty).toBeDefined();
    expect(body.settings.booking).toBeDefined();
    expect(body.settings.chatbot).toEqual({ knowledgeText: '' });
    expect(body.settings.leadForm).toEqual({
      retentionMonths: 6,
      maxSubmissionsPerDay: 100,
      maxSubmissionsPerIpPerDay: 3,
    });
  });

  it('returns 200 on GET when X-Actor-Role is STAFF', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'STAFF')
      .expect(200);

    expect(body.tenantId).toBe(tenantId);
  });

  it('returns 400 on GET when X-Tenant-ID header is missing', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/tenants/settings')
      .set('X-Actor-Role', 'MANAGER')
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 403 on GET when X-Actor-Role is absent entirely', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .expect(403);

    expect(body.status).toBe(403);
  });

  it('GET only returns the requesting tenant settings, not another tenant', async () => {
    const { body: otherBody } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', TEST_KEY)
      .send({
        name: 'Other Tenant Settings Test',
        slug: 'other-tenant-settings-integ-01',
        adminEmail: 'other-settings@test.com.br',
        country_code: 'BR',
      })
      .expect(201);
    const otherTenantId = otherBody.tenantId as string;

    await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', otherTenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { loyalty: { expiryDays: 30 } } })
      .expect(200);

    const { body } = await request(app.getHttpServer())
      .get('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .expect(200);

    expect(body.tenantId).toBe(tenantId);
    expect(body.settings.loyalty.expiryDays).not.toBe(30);
  });

  it('returns 400 when X-Tenant-ID header is missing', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { loyalty: { expiryDays: 90 } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 403 when X-Actor-Role is not MANAGER', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'STAFF')
      .send({ settings: { loyalty: { expiryDays: 90 } } })
      .expect(403);

    expect(body.status).toBe(403);
  });

  it('returns 400 for an invalid payload (cancellationWindowHours negative)', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { booking: { cancellationWindowHours: -1 } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for an invalid slotGranularityMinutes value', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { booking: { slotGranularityMinutes: 45 } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 with the dedicated field-specific code for an out-of-range leadForm.retentionMonths (M20-S04 boundary regression)', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { leadForm: { retentionMonths: 25 } } })
      .expect(400);

    // Proves the real request-boundary response, not just the shared Zod schema in isolation —
    // this is the exact bug M20-S04 fixed: a plain .int().min().max() here would return the
    // generic GENERIC_VALUE_OUT_OF_RANGE code instead (Codex review finding, PR #422).
    expect(body.violations).toEqual([
      expect.objectContaining({
        field: 'settings.leadForm.retentionMonths',
        code: 'PLATFORM_SETTINGS_LEAD_FORM_RETENTION_MONTHS_INVALID',
      }),
    ]);
  });

  it('returns 200 and persists a partial loyalty update', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { loyalty: { expiryDays: 365 } } })
      .expect(200);

    expect(body.settings.loyalty.expiryDays).toBe(365);
    expect(body.settings.loyalty.enableNotifications).toBe(true);
    expect(body.settings.booking.cancellationWindowHours).toBe(48);

    const row = await ds.getRepository(TenantEntity).findOne({ where: { id: tenantId } });
    expect(row!.settings.loyalty.expiryDays).toBe(365);
  });

  it('returns 200 and persists a partial booking update without wiping loyalty', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { booking: { cancellationWindowHours: 72 } } })
      .expect(200);

    expect(body.settings.booking.cancellationWindowHours).toBe(72);
    expect(body.settings.loyalty.expiryDays).toBe(365);
  });

  it('returns 400 when the body has no settings field (name moved to PATCH /tenants)', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ name: 'Lavacar Renomeado' })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for an empty settings object (no-op update)', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: {} })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for an unknown key inside settings', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { not_a_real_category: { foo: 'bar' } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for an invalid IANA timezone from domain validation', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { businessHours: { timezone: 'Not/AZone' } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 200 and persists a businessInfo update with address', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({
        settings: {
          businessInfo: {
            phone: '+5511987654321',
            email: 'contato@beloauto.com.br',
            address: {
              street: 'Av. Paulista',
              number: '1000',
              neighborhood: 'Bela Vista',
              city: 'São Paulo',
              state: 'SP',
              zipCode: '01310100',
            },
          },
        },
      })
      .expect(200);

    expect(body.settings.businessInfo.phone).toBe('+5511987654321');
    expect(body.settings.businessInfo.address.zipCode).toBe('01310100');

    const row = await ds.getRepository(TenantEntity).findOne({ where: { id: tenantId } });
    expect(row!.settings.businessInfo?.email).toBe('contato@beloauto.com.br');
  });

  it('returns 400 for an invalid businessInfo.address.zipCode', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({
        settings: {
          businessInfo: {
            address: {
              street: 'Av. Paulista',
              number: '1000',
              neighborhood: 'Bela Vista',
              city: 'São Paulo',
              state: 'SP',
              zipCode: '123',
            },
          },
        },
      })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for an invalid businessInfo.phone', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { businessInfo: { phone: '123' } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 200 and persists socialLinks in businessInfo', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({
        settings: {
          businessInfo: {
            socialLinks: {
              whatsapp: '+5511987654321',
              instagram: 'https://instagram.com/lavacar',
              facebook: 'https://facebook.com/lavacar',
            },
          },
        },
      })
      .expect(200);

    expect(body.settings.businessInfo.socialLinks).toEqual({
      whatsapp: '+5511987654321',
      instagram: 'https://instagram.com/lavacar',
      facebook: 'https://facebook.com/lavacar',
    });

    const row = await ds.getRepository(TenantEntity).findOne({ where: { id: tenantId } });
    expect(row!.settings.businessInfo?.socialLinks?.whatsapp).toBe('+5511987654321');
  });

  it('returns 400 for an invalid socialLinks.whatsapp (not a phone number)', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({
        settings: { businessInfo: { socialLinks: { whatsapp: '123' } } },
      })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 200 and persists socialLinks set to null (all fields blank client-side)', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({
        settings: { businessInfo: { socialLinks: null } },
      })
      .expect(200);

    expect(body.settings.businessInfo.socialLinks).toBeNull();
  });

  it('returns 200 and persists a notification.fromEmail update', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({
        settings: { notification: { fromEmail: 'reservas@lavacar.com.br' } },
      })
      .expect(200);

    expect(body.settings.notification).toEqual({ fromEmail: 'reservas@lavacar.com.br' });

    const row = await ds.getRepository(TenantEntity).findOne({ where: { id: tenantId } });
    expect(row!.settings.notification?.fromEmail).toBe('reservas@lavacar.com.br');
  });

  it('returns 200 and persists a chatbot.knowledgeText update', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({
        settings: {
          chatbot: {
            knowledgeText:
              'Trabalhamos apenas com agendamento — não atendemos por ordem de chegada.',
          },
        },
      })
      .expect(200);

    expect(body.settings.chatbot.knowledgeText).toBe(
      'Trabalhamos apenas com agendamento — não atendemos por ordem de chegada.',
    );

    const row = await ds.getRepository(TenantEntity).findOne({ where: { id: tenantId } });
    expect(row!.settings.chatbot?.knowledgeText).toBe(
      'Trabalhamos apenas com agendamento — não atendemos por ordem de chegada.',
    );
  });

  it('returns 400 for a chatbot.knowledgeText exceeding the default 4000-char limit', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { chatbot: { knowledgeText: 'a'.repeat(4001) } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for an unrecognized key inside chatbot (e.g. an Ikaro-only cap field)', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { chatbot: { maxConversationsPerDay: 100 } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns chatbot: { knowledgeText: "" } on GET for a legacy tenant whose stored settings predate the chatbot category', async () => {
    const currentTenant = await ds.getRepository(TenantEntity).findOne({ where: { id: tenantId } });
    const legacyTenant = new TenantEntityBuilder()
      .withId('00000000-0000-0000-0000-000000000002')
      .withSlug('lavacar-legacy-settings-integ-01')
      .withSettings({ ...currentTenant!.settings, chatbot: undefined })
      .build();
    await ds.getRepository(TenantEntity).save(legacyTenant);

    const { body } = await request(app.getHttpServer())
      .get('/tenants/settings')
      .set('X-Tenant-ID', legacyTenant.id)
      .set('X-Actor-Role', 'MANAGER')
      .expect(200);

    expect(body.settings.chatbot).toEqual({ knowledgeText: '' });
  });

  it('never leaks an Ikaro-only chatbot override (llmProvider, caps) into the GET response', async () => {
    const currentTenant = await ds.getRepository(TenantEntity).findOne({ where: { id: tenantId } });
    const overrideTenant = new TenantEntityBuilder()
      .withId('00000000-0000-0000-0000-000000000003')
      .withSlug('lavacar-override-settings-integ-01')
      .withSettings({
        ...currentTenant!.settings,
        chatbot: { knowledgeText: 'texto', llmProvider: 'anthropic', maxConversationsPerDay: 100 },
      })
      .build();
    await ds.getRepository(TenantEntity).save(overrideTenant);

    const { body } = await request(app.getHttpServer())
      .get('/tenants/settings')
      .set('X-Tenant-ID', overrideTenant.id)
      .set('X-Actor-Role', 'MANAGER')
      .expect(200);

    expect(body.settings.chatbot).toEqual({ knowledgeText: 'texto' });
  });

  it('returns 409 when the tenant is inactive', async () => {
    const inactiveTenant = new TenantEntityBuilder()
      .withId('00000000-0000-0000-0000-000000000001')
      .withSlug('lavacar-inactive-integ-01')
      .withIsActive(false)
      .build();
    await ds.getRepository(TenantEntity).save(inactiveTenant);

    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', inactiveTenant.id)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { loyalty: { expiryDays: 90 } } })
      .expect(409);

    expect(body.status).toBe(409);
    expect(body.detail).toContain('inactive');
  });

  describe('GET /tenants/chatbot/cap-status', () => {
    it('returns 403 when X-Actor-Role is STAFF', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/tenants/chatbot/cap-status')
        .set('X-Tenant-ID', tenantId)
        .set('X-Actor-Role', 'STAFF')
        .expect(403);

      expect(body.status).toBe(403);
    });

    it('returns { dailyCapReachedToday: false } when no conversations happened today', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/tenants/chatbot/cap-status')
        .set('X-Tenant-ID', tenantId)
        .set('X-Actor-Role', 'MANAGER')
        .expect(200);

      expect(body).toEqual({ dailyCapReachedToday: false });
    });

    it("agrees with SendChatMessageUseCase/GetChatbotStatusUseCase's own daily-cap boundary — the same COUNT query and threshold against chatbot_sessions", async () => {
      const cappedTenantId = '00000000-0000-0000-0000-000000000004';
      const cappedTenant = new TenantEntityBuilder()
        .withId(cappedTenantId)
        .withSlug('lavacar-cap-status-integ-01')
        .build();
      await ds.getRepository(TenantEntity).save(cappedTenant);
      // RequestContext.settings is resolved via TENANT_SETTINGS_PORT (swapped for this fake by
      // createPlatformIntegrationApp, same as chatbot.controller.integration.spec.ts), not by
      // reading the TenantEntity row directly — the override must be set here for GetChatbotCapStatusUseCase to see it.
      settingsPort.set(cappedTenantId, {
        ...TenantSettings.default().toJSON(),
        chatbot: { knowledgeText: '', maxConversationsPerDay: 1 },
      });

      const belowCap = await request(app.getHttpServer())
        .get('/tenants/chatbot/cap-status')
        .set('X-Tenant-ID', cappedTenantId)
        .set('X-Actor-Role', 'MANAGER')
        .expect(200);
      expect(belowCap.body).toEqual({ dailyCapReachedToday: false });

      await ds.getRepository(ChatbotSessionEntity).save(recentSession(cappedTenantId));

      const atCap = await request(app.getHttpServer())
        .get('/tenants/chatbot/cap-status')
        .set('X-Tenant-ID', cappedTenantId)
        .set('X-Actor-Role', 'MANAGER')
        .expect(200);
      expect(atCap.body).toEqual({ dailyCapReachedToday: true });
    });

    it("does not let tenant A's reached cap affect tenant B's cap-status", async () => {
      const tenantA = new TenantEntityBuilder()
        .withId('00000000-0000-0000-0000-000000000005')
        .withSlug('lavacar-cap-status-tenant-a-integ-01')
        .build();
      const tenantB = new TenantEntityBuilder()
        .withId('00000000-0000-0000-0000-000000000006')
        .withSlug('lavacar-cap-status-tenant-b-integ-01')
        .build();
      await ds.getRepository(TenantEntity).save([tenantA, tenantB]);

      for (let i = 0; i < 30; i++) {
        await ds.getRepository(ChatbotSessionEntity).save(recentSession(tenantA.id));
      }

      const { body } = await request(app.getHttpServer())
        .get('/tenants/chatbot/cap-status')
        .set('X-Tenant-ID', tenantB.id)
        .set('X-Actor-Role', 'MANAGER')
        .expect(200);

      expect(body).toEqual({ dailyCapReachedToday: false });
    });
  });
});
