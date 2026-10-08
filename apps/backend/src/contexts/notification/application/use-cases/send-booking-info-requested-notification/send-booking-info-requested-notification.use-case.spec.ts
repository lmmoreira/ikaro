import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryInboxRepository } from '../../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { JsonLocalizationAdapter } from '../../../infrastructure/adapters/json-localization.adapter';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendBookingInfoRequestedNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendBookingInfoRequestedNotificationUseCase } from './send-booking-info-requested-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0003-4000-8000-000000000001';
const EVENT_ID = 'cccccccc-0003-4000-8000-000000000001';
const BOOKING_ID = 'bbbbbbbb-0003-4000-8000-000000000001';
const PT_BR_SUBJECT = 'Precisamos de mais informações sobre seu agendamento';

const configService = {
  getOrThrow: (key: string): string => {
    const values: Record<string, string> = {
      FRONTEND_URL: 'http://localhost:3000',
      JWT_SECRET: 'test-secret-at-least-64-chars-long-xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    };
    if (!(key in values)) throw new Error(`Unknown config key: ${key}`);
    return values[key];
  },
} as unknown as ConfigService;

const guestDto = new SendBookingInfoRequestedNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .withBookingId(BOOKING_ID)
  .build();

const customerDto = new SendBookingInfoRequestedNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId('cccccccc-0003-4000-8000-000000000002')
  .withBookingId(BOOKING_ID)
  .withCustomerId('dddddddd-0003-4000-8000-000000000001')
  .build();

describe('SendBookingInfoRequestedNotificationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let inboxRepo: InMemoryInboxRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let templateRepo: InMemoryNotificationTemplateRepository;
  let platformPort: InMemoryNotificationPlatformPort;
  let useCase: SendBookingInfoRequestedNotificationUseCase;

  beforeEach(() => {
    logRepo = new InMemoryNotificationLogRepository();
    inboxRepo = new InMemoryInboxRepository();
    dispatcher = new InMemoryNotificationDispatcher();
    templateRepo = new InMemoryNotificationTemplateRepository();
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId: TENANT_ID,
        triggerEvent: NotificationTemplateKey.BOOKING_INFO_REQUESTED_CUSTOMER,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
    );
    const localizationPort = new JsonLocalizationAdapter();
    platformPort = new InMemoryNotificationPlatformPort();
    platformPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'Lava Car Test',
      slug: 'lava-car-test',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      replyToEmail: null,
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
    });
    useCase = new SendBookingInfoRequestedNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      new InMemoryTransactionManager(),
      templateRepo,
      platformPort,
      localizationPort,
      configService,
    );
  });

  it('dispatches info-request email to guest with signed token link in body', async () => {
    const result = await useCase.execute(guestDto);

    expect(result.emailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);

    const msg = dispatcher.dispatched[0];
    expect(msg.to).toBe('joao@example.com');
    expect(msg.subject).toBe(PT_BR_SUBJECT);
    expect(msg.body).toContain(guestDto.informationNeeded);
    expect(msg.body).toContain(`/bookings/${BOOKING_ID}/submit-info?token=`);
    expect(msg.body).not.toContain('/responder');
    expect(msg.body).not.toContain('/dashboard/');

    const [, token] = /token=([^"]+)/.exec(msg.body) ?? [];
    const payload = jwt.decode(token!) as { tenantSlug?: string };
    expect(payload.tenantSlug).toBe('lava-car-test');

    expect(logRepo.all).toHaveLength(1);
    expect(logRepo.all[0].notificationType).toBe('booking-info-requested-customer');
  });

  it('links an authenticated customer to their own booking page, not the staff dashboard', async () => {
    await useCase.execute(customerDto);

    const msg = dispatcher.dispatched[0];
    expect(msg.body).toContain(
      `http://localhost:3000/lava-car-test/my-account/bookings/${BOOKING_ID}`,
    );
    expect(msg.body).not.toContain('/dashboard/');
    expect(msg.body).not.toContain('token=');
  });

  it('escapes the customer name and the information the manager typed', async () => {
    await useCase.execute({
      ...customerDto,
      contactName: 'Ana <b>X</b>',
      informationNeeded: 'Send <script>alert(1)</script> photo',
    });

    const msg = dispatcher.dispatched[0];
    expect(msg.body).toContain('Ana &lt;b&gt;X&lt;/b&gt;');
    expect(msg.body).toContain('Send &lt;script&gt;alert(1)&lt;/script&gt; photo');
    expect(msg.body).not.toContain('<script>');
  });

  it('sends nothing to a customer whose tenant can no longer be found', async () => {
    const orphanUseCase = new SendBookingInfoRequestedNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      new InMemoryTransactionManager(),
      templateRepo,
      new InMemoryNotificationPlatformPort(),
      new JsonLocalizationAdapter(),
      configService,
    );

    const result = await orphanUseCase.execute(customerDto);

    expect(result.emailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it('is idempotent: second call with same eventId sends no email', async () => {
    await useCase.execute(guestDto);
    dispatcher.clear();
    const result = await useCase.execute(guestDto);

    expect(result.emailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
    expect(logRepo.all).toHaveLength(1);
  });

  it('tenant isolation: log is scoped to correct tenantId', async () => {
    await useCase.execute(guestDto);
    expect(logRepo.all.every((l) => l.tenantId === TENANT_ID)).toBe(true);
  });
});
