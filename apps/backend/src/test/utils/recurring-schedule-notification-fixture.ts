import { JsonLocalizationAdapter } from '../../contexts/notification/infrastructure/adapters/json-localization.adapter';
import { NotificationTemplateKey } from '../../contexts/notification/domain/notification-template-key.enum';
import { NotificationTemplateBuilder } from '../builders/notification/notification-template.builder';
import { InMemoryInboxRepository } from '../infrastructure/in-memory-inbox.repository';
import { InMemoryNotificationBookingPort } from '../infrastructure/in-memory-notification-booking.port';
import { InMemoryNotificationCustomerPort } from '../infrastructure/in-memory-notification-customer.port';
import { InMemoryNotificationDispatcher } from '../infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationPlatformPort } from '../infrastructure/in-memory-notification-platform.port';
import { InMemoryNotificationStaffPort } from '../infrastructure/in-memory-notification-staff.port';
import { InMemoryTransactionManager } from '../infrastructure/in-memory-transaction-manager';
import { InMemoryNotificationLogRepository } from '../repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationTemplateRepository } from '../repositories/notification/in-memory-notification-template.repository';

export const RECURRING_TENANT_ID = 'aaaaaaaa-0000-4000-8000-0000000000a1';
export const RECURRING_OTHER_TENANT_ID = 'aaaaaaaa-0000-4000-8000-0000000000b2';
export const RECURRING_CUSTOMER_ID = 'cccccccc-0000-4000-8000-0000000000c1';
export const RECURRING_SERVICE_ID = 'eeeeeeee-0000-4000-8000-0000000000e1';
export const RECURRING_EVENT_ID = 'dddddddd-0000-4000-8000-0000000000d1';
export const RECURRING_CUSTOMER_EMAIL = 'maria@example.com';
export const RECURRING_MANAGER_EMAIL = 'gerente@lavacar.com.br';

// The in-memory doubles every recurring-schedule notification use case spec needs, wired to the
// real JsonLocalizationAdapter so a spec asserts the shipped pt-BR/en copy (and the negative
// guarantee that no internal id leaks into it) instead of a hand-typed stand-in.
export class RecurringScheduleNotificationFixture {
  readonly logRepo = new InMemoryNotificationLogRepository();
  readonly inboxRepo = new InMemoryInboxRepository();
  readonly dispatcher = new InMemoryNotificationDispatcher();
  readonly customerPort = new InMemoryNotificationCustomerPort();
  readonly servicePort = new InMemoryNotificationBookingPort();
  readonly tenantPort = new InMemoryNotificationPlatformPort();
  readonly staffPort = new InMemoryNotificationStaffPort();
  readonly templateRepo = new InMemoryNotificationTemplateRepository();
  readonly localizationPort = new JsonLocalizationAdapter();
  readonly txManager = new InMemoryTransactionManager();

  constructor(locale = 'pt-BR') {
    this.customerPort.setCustomer(RECURRING_TENANT_ID, RECURRING_CUSTOMER_ID, {
      email: RECURRING_CUSTOMER_EMAIL,
      name: 'Maria Souza',
    });
    this.servicePort.setService(RECURRING_TENANT_ID, {
      serviceId: RECURRING_SERVICE_ID,
      serviceName: 'Aula de Yoga',
    });
    this.staffPort.setManagerEmails(RECURRING_TENANT_ID, [RECURRING_MANAGER_EMAIL]);
    this.tenantPort.setTenantInfo(RECURRING_TENANT_ID, {
      id: RECURRING_TENANT_ID,
      name: 'Lava Car',
      slug: 'lavacar',
      timezone: 'America/Sao_Paulo',
      locale,
      replyToEmail: null,
    });
  }

  seedTemplate(key: NotificationTemplateKey, tenantId = RECURRING_TENANT_ID): this {
    this.templateRepo.seed(
      new NotificationTemplateBuilder()
        .withTenantId(tenantId)
        .withTriggerEvent(key)
        .withSubject('DB SUBJECT (unused)')
        .withBody('DB BODY (unused)')
        .build(),
    );
    return this;
  }
}
