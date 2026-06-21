import { ConfigService } from '@nestjs/config';
import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationProcessedEventRepository } from '../../../../../test/repositories/notification/in-memory-processed-event.repository';
import { InMemoryNotificationStaffPort } from '../../../../../test/infrastructure/in-memory-notification-staff.port';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { InMemoryLocalizationPort } from '../../../../../test/infrastructure/in-memory-localization.port';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendBookingInfoSubmittedNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendBookingInfoSubmittedNotificationUseCase } from './send-booking-info-submitted-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0004-4000-8000-000000000001';
const EVENT_ID = 'cccccccc-0004-4000-8000-000000000001';
const BOOKING_ID = 'bbbbbbbb-0004-4000-8000-000000000001';

const configService = {
  getOrThrow: (key: string): string => {
    if (key === 'FRONTEND_URL') return 'http://localhost:3000';
    throw new Error(`Unknown config key: ${key}`);
  },
} as unknown as ConfigService;

const dto = new SendBookingInfoSubmittedNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .build();

describe('SendBookingInfoSubmittedNotificationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let processedEventRepo: InMemoryNotificationProcessedEventRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let staffPort: InMemoryNotificationStaffPort;
  let templateRepo: InMemoryNotificationTemplateRepository;
  let useCase: SendBookingInfoSubmittedNotificationUseCase;

  beforeEach(() => {
    logRepo = new InMemoryNotificationLogRepository();
    processedEventRepo = new InMemoryNotificationProcessedEventRepository();
    dispatcher = new InMemoryNotificationDispatcher();
    staffPort = new InMemoryNotificationStaffPort();
    staffPort.setManagerEmails(TENANT_ID, ['manager@lavacar.com.br']);
    templateRepo = new InMemoryNotificationTemplateRepository();
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId: TENANT_ID,
        triggerEvent: NotificationTemplateKey.BOOKING_INFO_SUBMITTED_ADMIN,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
    );
    const localizationPort = new InMemoryLocalizationPort();
    localizationPort.setTemplate('BookingInfoSubmitted:admin', {
      subject: 'Cliente respondeu à solicitação de informações',
      body: '<p>{{submittedByEmail}} — {{customerResponse}} — <a href="{{bookingLink}}">Ver</a></p>',
    });
    useCase = new SendBookingInfoSubmittedNotificationUseCase(
      logRepo,
      processedEventRepo,
      dispatcher,
      staffPort,
      new InMemoryTransactionManager(),
      templateRepo,
      new InMemoryNotificationPlatformPort(),
      localizationPort,
      configService,
    );
  });

  it('dispatches admin email with customer response and booking link in body', async () => {
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);

    const msg = dispatcher.dispatched[0];
    expect(msg.to).toBe('manager@lavacar.com.br');
    expect(msg.subject).toBe('Cliente respondeu à solicitação de informações');
    expect(msg.body).toContain('joao@example.com');
    expect(msg.body).toContain('Aqui estão as fotos do veículo conforme solicitado');
    expect(msg.body).toContain(`http://localhost:3000/dashboard/bookings/${BOOKING_ID}`);

    expect(logRepo.all).toHaveLength(1);
    expect(logRepo.all[0].notificationType).toBe('booking-info-submitted-admin');
  });

  it('sends to all managers when multiple exist', async () => {
    staffPort.setManagerEmails(TENANT_ID, ['mgr1@lavacar.com.br', 'mgr2@lavacar.com.br']);
    await useCase.execute(dto);

    expect(dispatcher.dispatched).toHaveLength(2);
    expect(dispatcher.dispatched.map((m) => m.to)).toEqual(
      expect.arrayContaining(['mgr1@lavacar.com.br', 'mgr2@lavacar.com.br']),
    );
    expect(logRepo.all).toHaveLength(1);
  });

  it('skips dispatch and returns emailSent=false when no managers exist', async () => {
    staffPort.setManagerEmails(TENANT_ID, []);
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
    expect(logRepo.all).toHaveLength(0);
  });

  it('is idempotent: second call with same eventId sends no email', async () => {
    await useCase.execute(dto);
    dispatcher.clear();
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
    expect(logRepo.all).toHaveLength(1);
  });

  it('tenant isolation: log is scoped to correct tenantId', async () => {
    await useCase.execute(dto);
    expect(logRepo.all.every((l) => l.tenantId === TENANT_ID)).toBe(true);
  });
});
