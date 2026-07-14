import { DataSource } from 'typeorm';
import { InboxRecordEntity } from '../../../../../shared/infrastructure/inbox/inbox-record.entity';
import { TypeOrmInboxRepository } from '../../../../../shared/infrastructure/inbox/typeorm-inbox.repository';
import { createTestDataSource } from '../../../../../test/test-datasource';
import { uuidv7 } from '../../../../../shared/domain/uuid-v7';
import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryLocalizationPort } from '../../../../../test/infrastructure/in-memory-localization.port';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendBookingApprovedNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendBookingApprovedNotificationUseCase } from './send-booking-approved-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0002-4000-8000-000000000001';

// TD24-S04 follow-up: proves the atomic-claim protocol (tryClaim/unclaim) actually serializes two
// concurrent deliveries of the same eventId against a REAL Postgres instance — the in-memory
// double can't demonstrate this (a synchronous Set check-then-add never actually interleaves
// under Node's single-threaded event loop, unlike two genuine concurrent SQL statements). Only
// inboxRepo is real here; every other dependency stays a lightweight in-memory double, since
// tryClaim/unclaim never touch any ambient transaction (see typeorm-inbox.repository.ts).
describe('SendBookingApprovedNotificationUseCase — inbox atomic claim (integration)', () => {
  let ds: DataSource;
  let inboxRepo: TypeOrmInboxRepository;

  beforeAll(async () => {
    ds = await createTestDataSource();
    inboxRepo = new TypeOrmInboxRepository(ds.getRepository(InboxRecordEntity));
  });

  afterAll(async () => {
    await ds.destroy();
  });

  function makeUseCase(
    dispatcher: InMemoryNotificationDispatcher,
  ): SendBookingApprovedNotificationUseCase {
    const tenantPort = new InMemoryNotificationPlatformPort();
    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'Lava Car',
      slug: 'lavacar',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      fromEmail: null,
    });
    const templateRepo = new InMemoryNotificationTemplateRepository();
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId: TENANT_ID,
        triggerEvent: NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'unused — sourced from ILocalizationPort',
        body: 'unused',
      }),
    );
    const localizationPort = new InMemoryLocalizationPort();
    localizationPort.setTemplate('BookingApproved:customer', {
      subject: 'Confirmado',
      body: '<p>{{contactName}}</p>',
    });

    return new SendBookingApprovedNotificationUseCase(
      new InMemoryNotificationLogRepository(),
      inboxRepo,
      dispatcher,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
      localizationPort,
    );
  }

  it('two concurrent deliveries of the same eventId dispatch exactly once', async () => {
    const dto = new SendBookingApprovedNotificationDtoBuilder()
      .withTenantId(TENANT_ID)
      .withEventId(uuidv7())
      .build();
    const dispatcher = new InMemoryNotificationDispatcher();
    const useCaseA = makeUseCase(dispatcher);
    const useCaseB = makeUseCase(dispatcher);

    const [resultA, resultB] = await Promise.all([useCaseA.execute(dto), useCaseB.execute(dto)]);

    expect(dispatcher.dispatched).toHaveLength(1);
    expect([resultA.emailSent, resultB.emailSent].filter(Boolean)).toHaveLength(1);
  });
});
