import { PlatformTemplateNotFoundError } from '../../../contexts/notification/domain/errors/platform-template-not-found.error';
import { NotificationTemplateKey } from '../../../contexts/notification/domain/notification-template-key.enum';
import { NotificationTemplateBuilder } from '../../builders/notification/notification-template.builder';
import { InMemoryNotificationTemplateRepository } from './in-memory-notification-template.repository';

const TENANT = '10000000-0000-4000-8000-000000000041';

// The double must behave like the TypeORM repository for the two platform-scoped behaviours, or a
// use case spec that passes against it proves nothing about production.
describe('InMemoryNotificationTemplateRepository', () => {
  let repo: InMemoryNotificationTemplateRepository;

  beforeEach(() => {
    repo = new InMemoryNotificationTemplateRepository();
  });

  describe('findPlatformTemplate', () => {
    it('returns the tenant-less row of the key and locale', async () => {
      const platform = new NotificationTemplateBuilder()
        .withPlatformScope()
        .withLocale('en')
        .build();
      repo.seed(platform);

      expect(await repo.findPlatformTemplate(NotificationTemplateKey.CHARGE_PAID, 'en')).toBe(
        platform,
      );
    });

    it('throws for another locale, and for a key that is not platform-scoped', async () => {
      repo.seed(new NotificationTemplateBuilder().withPlatformScope().build());
      repo.seed(
        new NotificationTemplateBuilder()
          .asGlobalDefault()
          .withTriggerEvent(NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER)
          .build(),
      );

      await expect(
        repo.findPlatformTemplate(NotificationTemplateKey.CHARGE_PAID, 'en'),
      ).rejects.toBeInstanceOf(PlatformTemplateNotFoundError);
      await expect(
        repo.findPlatformTemplate(NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER, 'pt-BR'),
      ).rejects.toBeInstanceOf(PlatformTemplateNotFoundError);
    });

    it("ignores a tenant's own row of the same key", async () => {
      repo.seed(
        new NotificationTemplateBuilder()
          .withTenantId(TENANT)
          .withTriggerEvent(NotificationTemplateKey.CHARGE_PAID)
          .build(),
      );

      await expect(
        repo.findPlatformTemplate(NotificationTemplateKey.CHARGE_PAID, 'pt-BR'),
      ).rejects.toBeInstanceOf(PlatformTemplateNotFoundError);
    });
  });

  describe('copyGlobalDefaultsForTenant', () => {
    it('skips the platform-scoped defaults and copies the rest', async () => {
      repo.seed(new NotificationTemplateBuilder().withPlatformScope().build());
      repo.seed(
        new NotificationTemplateBuilder()
          .asGlobalDefault()
          .withTriggerEvent(NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER)
          .build(),
      );

      const copied = await repo.copyGlobalDefaultsForTenant(TENANT, 'pt-BR');

      expect(copied).toBe(1);
      expect(await repo.findAllByTriggerEvent(TENANT, NotificationTemplateKey.CHARGE_PAID)).toEqual(
        [],
      );
    });
  });
});
