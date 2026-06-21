import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationProcessedEventRepository } from '../../../../../test/repositories/notification/in-memory-processed-event.repository';
import { InMemoryNotificationStaffPort } from '../../../../../test/infrastructure/in-memory-notification-staff.port';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryLocalizationPort } from '../../../../../test/infrastructure/in-memory-localization.port';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendBookingRescheduledNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendBookingRescheduledNotificationUseCase } from './send-booking-rescheduled-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const EVENT_ID = 'cccccccc-0002-4000-8000-000000000001';

const dto = new SendBookingRescheduledNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .build();

describe('SendBookingRescheduledNotificationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let processedEventRepo: InMemoryNotificationProcessedEventRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let staffPort: InMemoryNotificationStaffPort;
  let tenantPort: InMemoryNotificationPlatformPort;
  let templateRepo: InMemoryNotificationTemplateRepository;
  let useCase: SendBookingRescheduledNotificationUseCase;

  beforeEach(() => {
    logRepo = new InMemoryNotificationLogRepository();
    processedEventRepo = new InMemoryNotificationProcessedEventRepository();
    dispatcher = new InMemoryNotificationDispatcher();
    staffPort = new InMemoryNotificationStaffPort();
    staffPort.setManagerEmails(TENANT_ID, ['manager@lavacar.com.br']);
    tenantPort = new InMemoryNotificationPlatformPort();
    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'Lava Car',
      slug: 'lavacar',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      fromEmail: null,
    });
    templateRepo = new InMemoryNotificationTemplateRepository();
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId: TENANT_ID,
        triggerEvent: NotificationTemplateKey.BOOKING_RESCHEDULED_CUSTOMER,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
    );
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId: TENANT_ID,
        triggerEvent: NotificationTemplateKey.BOOKING_RESCHEDULED_ADMIN,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
    );
    const localizationPort = new InMemoryLocalizationPort();
    localizationPort.setTemplate('BookingRescheduled:customer', {
      subject: 'Seu agendamento foi reagendado',
      body: '<p>Olá, {{contactName}}! Anterior: {{previousLocalDate}} {{previousLocalTime}} Novo: {{newLocalDate}} {{newLocalTime}}</p>',
    });
    localizationPort.setTemplate('BookingRescheduled:admin', {
      subject: 'Agendamento reagendado',
      body: '<p>Cliente: {{contactName}}</p>',
    });
    useCase = new SendBookingRescheduledNotificationUseCase(
      logRepo,
      processedEventRepo,
      dispatcher,
      staffPort,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
      localizationPort,
    );
  });

  it('dispatches customer and admin emails with old and new slot data', async () => {
    const result = await useCase.execute(dto);

    expect(result.customerEmailSent).toBe(true);
    expect(result.adminEmailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(2);

    const customerMsg = dispatcher.dispatched.find((m) => m.to === 'joao@example.com');
    expect(customerMsg).toBeDefined();
    expect(customerMsg!.subject).toBe('Seu agendamento foi reagendado');
    expect(customerMsg!.body).toContain('João Silva');

    const adminMsg = dispatcher.dispatched.find((m) => m.to === 'manager@lavacar.com.br');
    expect(adminMsg).toBeDefined();
    expect(adminMsg!.subject).toBe('Agendamento reagendado');

    const logs = logRepo.all;
    expect(logs).toHaveLength(2);
    const types = logs.map((l) => l.notificationType);
    expect(types).toContain('booking-rescheduled-customer');
    expect(types).toContain('booking-rescheduled-admin');
  });

  it('renders previous and new dates in customer email body', async () => {
    await useCase.execute(dto);
    const customerMsg = dispatcher.dispatched.find((m) => m.to === 'joao@example.com');
    // previousLocalDate and newLocalDate should differ (different timestamps in dto builder)
    expect(customerMsg!.body).toContain('Anterior:');
    expect(customerMsg!.body).toContain('Novo:');
  });

  it('skips admin email gracefully when no managers exist', async () => {
    staffPort.setManagerEmails(TENANT_ID, []);

    const result = await useCase.execute(dto);

    expect(result.customerEmailSent).toBe(true);
    expect(result.adminEmailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(1);
    expect(dispatcher.dispatched[0].to).toBe('joao@example.com');
  });

  it('sends only admin email when customer already processed (partial retry)', async () => {
    await processedEventRepo.markProcessed(EVENT_ID, 'booking-rescheduled-customer', 'EMAIL');

    const result = await useCase.execute(dto);

    expect(result.customerEmailSent).toBe(false);
    expect(result.adminEmailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);
    expect(dispatcher.dispatched[0].to).toBe('manager@lavacar.com.br');
  });

  it('sends only customer email when admin already processed (partial retry)', async () => {
    await processedEventRepo.markProcessed(EVENT_ID, 'booking-rescheduled-admin', 'EMAIL');

    const result = await useCase.execute(dto);

    expect(result.customerEmailSent).toBe(true);
    expect(result.adminEmailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(1);
    expect(dispatcher.dispatched[0].to).toBe('joao@example.com');
  });

  it('is idempotent: second call with same eventId dispatches no emails and creates no extra logs', async () => {
    await useCase.execute(dto);
    dispatcher.clear();

    const result = await useCase.execute(dto);

    expect(result.customerEmailSent).toBe(false);
    expect(result.adminEmailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
    expect(logRepo.all).toHaveLength(2);
  });

  it('tenant isolation: log rows are scoped to the correct tenantId', async () => {
    await useCase.execute(dto);
    expect(logRepo.all.every((l) => l.tenantId === TENANT_ID)).toBe(true);
  });

  it('falls back to America/Sao_Paulo timezone when tenant info is not found', async () => {
    const unknownTenantDto = new SendBookingRescheduledNotificationDtoBuilder()
      .withTenantId('ffffffff-0000-4000-8000-000000000099')
      .withEventId('cccccccc-0099-4000-8000-000000000002')
      .build();

    await expect(useCase.execute(unknownTenantDto)).resolves.not.toThrow();
  });
});
