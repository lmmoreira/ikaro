import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { createNotificationIntegrationApp } from '../../../../test/utils/notification-integration-app';
import { NotificationTemplateEntityBuilder } from '../../../../test/builders/notification/notification-template-entity.builder';
import { PlatformTemplateNotFoundError } from '../../domain/errors/platform-template-not-found.error';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { PLATFORM_SCOPED_TEMPLATE_KEYS } from '../../domain/notification-template-key.mapping';
import { NotificationTemplateEntity } from '../entities/notification-template.entity';
import {
  INotificationTemplateRepository,
  NOTIFICATION_TEMPLATE_REPOSITORY,
} from '../../application/ports/notification-template-repository.port';

const LOCALES = ['pt-BR', 'en'] as const;

describe('TypeOrmNotificationTemplateRepository (integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let repo: INotificationTemplateRepository;
  const tenantIds: string[] = [];

  function newTenantId(): string {
    const id = uuidv7();
    tenantIds.push(id);
    return id;
  }

  beforeAll(async () => {
    ({ app, ds: dataSource } = await createNotificationIntegrationApp({
      dispatcher: new InMemoryNotificationDispatcher(),
    }));
    repo = app.get<INotificationTemplateRepository>(NOTIFICATION_TEMPLATE_REPOSITORY);
  });

  afterEach(async () => {
    await dataSource.query(
      `DELETE FROM "notification"."notification_templates" WHERE tenant_id = ANY($1::uuid[])`,
      [tenantIds],
    );
    tenantIds.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('the seeded platform templates', () => {
    it('exist exactly once for every platform-scoped key in both languages', async () => {
      const rows = await dataSource.query<{ trigger_event: string; locale: string; n: string }[]>(
        `SELECT trigger_event, locale, COUNT(*) AS n
           FROM "notification"."notification_templates"
          WHERE tenant_id IS NULL AND channel = 'EMAIL' AND trigger_event = ANY($1::text[])
          GROUP BY trigger_event, locale`,
        [PLATFORM_SCOPED_TEMPLATE_KEYS],
      );

      expect(PLATFORM_SCOPED_TEMPLATE_KEYS).toHaveLength(17);
      expect(rows).toHaveLength(PLATFORM_SCOPED_TEMPLATE_KEYS.length * LOCALES.length);
      expect(rows.every((r) => Number(r.n) === 1)).toBe(true);
    });
  });

  describe('findPlatformTemplate', () => {
    it.each(LOCALES)('returns the tenant-less row of the key in %s', async (locale) => {
      const template = await repo.findPlatformTemplate(NotificationTemplateKey.CHARGE_PAID, locale);

      expect(template.tenantId).toBeNull();
      expect(template.triggerEvent).toBe(NotificationTemplateKey.CHARGE_PAID);
      expect(template.locale).toBe(locale);
      expect(template.channel).toBe('EMAIL');
    });

    it('throws PlatformTemplateNotFoundError for a locale with no row', async () => {
      await expect(
        repo.findPlatformTemplate(NotificationTemplateKey.CHARGE_PAID, 'fr'),
      ).rejects.toBeInstanceOf(PlatformTemplateNotFoundError);
    });

    it('throws for a key that is not platform-scoped, although a global default exists for it', async () => {
      await expect(
        repo.findPlatformTemplate(NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER, 'pt-BR'),
      ).rejects.toBeInstanceOf(PlatformTemplateNotFoundError);
    });

    it("never returns a tenant's own row of the same key", async () => {
      const tenantId = newTenantId();
      await dataSource
        .getRepository(NotificationTemplateEntity)
        .save(
          new NotificationTemplateEntityBuilder()
            .withTenantId(tenantId)
            .withTriggerEvent(NotificationTemplateKey.CHARGE_PAID)
            .withSubject('Tenant subject')
            .build(),
        );

      const template = await repo.findPlatformTemplate(
        NotificationTemplateKey.CHARGE_PAID,
        'pt-BR',
      );

      expect(template.tenantId).toBeNull();
      expect(template.subject).not.toBe('Tenant subject');
    });
  });

  describe('the tenant-strict lookup', () => {
    it('never returns the platform row, for a tenant with no copy', async () => {
      const result = await repo.findAllByTriggerEvent(
        newTenantId(),
        NotificationTemplateKey.CHARGE_PAID,
      );

      expect(result).toEqual([]);
    });
  });

  describe('copyGlobalDefaultsForTenant', () => {
    it('copies every global default of the locale except the platform-scoped ones', async () => {
      const tenantId = newTenantId();
      const [{ n: expected }] = await dataSource.query<{ n: string }[]>(
        `SELECT COUNT(*) AS n FROM "notification"."notification_templates"
          WHERE tenant_id IS NULL AND locale = 'pt-BR' AND trigger_event <> ALL($1::text[])`,
        [PLATFORM_SCOPED_TEMPLATE_KEYS],
      );

      const copied = await repo.copyGlobalDefaultsForTenant(tenantId, 'pt-BR');

      const copiedKeys = await dataSource.query<{ trigger_event: string }[]>(
        `SELECT trigger_event FROM "notification"."notification_templates" WHERE tenant_id = $1`,
        [tenantId],
      );
      expect(copied).toBe(Number(expected));
      expect(copied).toBeGreaterThan(0);
      expect(copiedKeys).toHaveLength(Number(expected));
      for (const { trigger_event } of copiedKeys) {
        expect(PLATFORM_SCOPED_TEMPLATE_KEYS).not.toContain(trigger_event);
      }
    });
  });
});
