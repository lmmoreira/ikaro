import { ILocalizationPort } from '../../contexts/notification/application/ports/localization.port';
import { INotificationDispatcher } from '../../contexts/notification/application/ports/notification-dispatcher.port';
import { INotificationLogRepository } from '../../contexts/notification/application/ports/notification-log-repository.port';
import { INotificationPlatformPort } from '../../contexts/notification/application/ports/notification-platform.port';
import { INotificationStaffPort } from '../../contexts/notification/application/ports/notification-staff.port';
import { INotificationTemplateRepository } from '../../contexts/notification/application/ports/notification-template-repository.port';
import { PLATFORM_SCOPED_TEMPLATE_KEYS } from '../../contexts/notification/domain/notification-template-key.mapping';
import { JsonLocalizationAdapter } from '../../contexts/notification/infrastructure/adapters/json-localization.adapter';
import { IApplicationConfig } from '../../shared/ports/application-config.port';
import { IInboxRepository } from '../../shared/ports/inbox.port';
import { ITransactionManager } from '../../shared/ports/transaction-manager.port';
import { NotificationTemplateBuilder } from '../builders/notification/notification-template.builder';
import { InMemoryInboxRepository } from '../infrastructure/in-memory-inbox.repository';
import { InMemoryNotificationDispatcher } from '../infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationPlatformPort } from '../infrastructure/in-memory-notification-platform.port';
import { InMemoryNotificationStaffPort } from '../infrastructure/in-memory-notification-staff.port';
import { InMemoryTransactionManager } from '../infrastructure/in-memory-transaction-manager';
import { InMemoryNotificationLogRepository } from '../repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationTemplateRepository } from '../repositories/notification/in-memory-notification-template.repository';
import { fakeConfig } from './fake-config';

export const BILLING_FIXTURE_TENANT_ID = 'aaaaaaaa-0026-4000-8000-000000000001';
export const BILLING_FIXTURE_OTHER_TENANT_ID = 'aaaaaaaa-0026-4000-8000-000000000002';
export const BILLING_FIXTURE_FRONTEND_URL = 'https://app.example.com';

type BillingUseCaseConstructor<T> = new (
  logRepo: INotificationLogRepository,
  inboxRepo: IInboxRepository,
  dispatcher: INotificationDispatcher,
  txManager: ITransactionManager,
  staffPort: INotificationStaffPort,
  tenantPort: INotificationPlatformPort,
  templateRepo: INotificationTemplateRepository,
  localizationPort: ILocalizationPort,
  config: IApplicationConfig,
) => T;

// The ports a Billing send use case is built from, in memory, with the real localization catalog (so a
// spec reads the copy the manager would read) and the 17 platform templates seeded in both languages.
export class BillingNotificationFixture {
  readonly logRepo = new InMemoryNotificationLogRepository();
  readonly inboxRepo = new InMemoryInboxRepository();
  readonly dispatcher = new InMemoryNotificationDispatcher();
  readonly staffPort = new InMemoryNotificationStaffPort();
  readonly tenantPort = new InMemoryNotificationPlatformPort();
  readonly templateRepo = new InMemoryNotificationTemplateRepository();
  readonly localization = new JsonLocalizationAdapter();

  // seedTemplates = false leaves the platform template table empty: every lookup misses.
  constructor(locale = 'pt-BR', seedTemplates = true) {
    this.setTenant(BILLING_FIXTURE_TENANT_ID, locale);
    this.staffPort.setManagerEmails(BILLING_FIXTURE_TENANT_ID, [
      'ana@example.com',
      'bruno@example.com',
    ]);
    if (seedTemplates) this.seedPlatformTemplates(['pt-BR', 'en']);
  }

  setTenant(tenantId: string, locale = 'pt-BR'): void {
    this.tenantPort.setTenantInfo(tenantId, {
      id: tenantId,
      name: 'Clínica <Sol>',
      slug: 'clinica-sol',
      timezone: 'America/Sao_Paulo',
      locale,
      replyToEmail: null,
    });
  }

  seedPlatformTemplates(locales: string[]): void {
    for (const locale of locales) {
      for (const key of PLATFORM_SCOPED_TEMPLATE_KEYS) {
        this.templateRepo.seed(
          new NotificationTemplateBuilder()
            .asGlobalDefault()
            .withTriggerEvent(key)
            .withLocale(locale)
            .build(),
        );
      }
    }
  }

  build<T>(useCase: BillingUseCaseConstructor<T>): T {
    return new useCase(
      this.logRepo,
      this.inboxRepo,
      this.dispatcher,
      new InMemoryTransactionManager(),
      this.staffPort,
      this.tenantPort,
      this.templateRepo,
      this.localization,
      fakeConfig({ FRONTEND_URL: BILLING_FIXTURE_FRONTEND_URL }),
    );
  }
}
