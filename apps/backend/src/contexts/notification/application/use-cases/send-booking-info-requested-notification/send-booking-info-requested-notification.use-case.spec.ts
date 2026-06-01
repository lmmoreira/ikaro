import { ConfigService } from '@nestjs/config';
import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendBookingInfoRequestedNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
import { SendBookingInfoRequestedNotificationUseCase } from './send-booking-info-requested-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0003-4000-8000-000000000001';
const EVENT_ID = 'cccccccc-0003-4000-8000-000000000001';
const BOOKING_ID = 'bbbbbbbb-0003-4000-8000-000000000001';

const configService = {
  getOrThrow: (key: string): string => {
    const values: Record<string, string> = {
      FRONTEND_URL: 'http://localhost:3000',
      JWT_SECRET: 'test-secret-at-least-32-chars-long!!',
    };
    if (!(key in values)) throw new Error(`Unknown config key: ${key}`);
    return values[key];
  },
} as unknown as ConfigService;

const guestDto = new SendBookingInfoRequestedNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .withBookingId(BOOKING_ID)
  .build(); // customerId: null by default

const customerDto = new SendBookingInfoRequestedNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId('cccccccc-0003-4000-8000-000000000002')
  .withBookingId(BOOKING_ID)
  .withCustomerId('dddddddd-0003-4000-8000-000000000001')
  .build();

describe('SendBookingInfoRequestedNotificationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let useCase: SendBookingInfoRequestedNotificationUseCase;

  beforeEach(() => {
    logRepo = new InMemoryNotificationLogRepository();
    dispatcher = new InMemoryNotificationDispatcher();
    useCase = new SendBookingInfoRequestedNotificationUseCase(
      logRepo,
      dispatcher,
      new InMemoryTransactionManager(),
      configService,
    );
  });

  it('dispatches info-request email to guest with signed token link', async () => {
    const result = await useCase.execute(guestDto);

    expect(result.emailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);

    const msg = dispatcher.dispatched[0];
    expect(msg.to).toBe('joao@example.com');
    expect(msg.subject).toBe('Precisamos de mais informações sobre seu agendamento');
    expect(msg.templateKey).toBe('booking-info-requested-customer');
    expect(msg.data['informationNeeded']).toBe(guestDto.informationNeeded);

    const link = msg.data['respondLink'] as string;
    expect(link).toContain(`/bookings/${BOOKING_ID}/responder?token=`);
    expect(link).not.toContain('/dashboard/');

    expect(logRepo.all).toHaveLength(1);
    expect(logRepo.all[0].notificationType).toBe('booking-info-requested-customer');
  });

  it('dispatches info-request email to authenticated customer with dashboard link', async () => {
    await useCase.execute(customerDto);

    const msg = dispatcher.dispatched[0];
    const link = msg.data['respondLink'] as string;
    expect(link).toBe(`http://localhost:3000/dashboard/bookings/${BOOKING_ID}`);
    expect(link).not.toContain('token=');
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
