import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationProcessedEventRepository } from '../../../../../test/repositories/notification/in-memory-processed-event.repository';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendBookingApprovedNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendBookingApprovedNotificationUseCase } from './send-booking-approved-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0001-4000-8000-000000000001';
const EVENT_ID = 'cccccccc-0001-4000-8000-000000000001';

const dto = new SendBookingApprovedNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .build();

describe('SendBookingApprovedNotificationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let processedEventRepo: InMemoryNotificationProcessedEventRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let tenantPort: InMemoryNotificationPlatformPort;
  let templateRepo: InMemoryNotificationTemplateRepository;
  let useCase: SendBookingApprovedNotificationUseCase;

  beforeEach(() => {
    logRepo = new InMemoryNotificationLogRepository();
    processedEventRepo = new InMemoryNotificationProcessedEventRepository();
    dispatcher = new InMemoryNotificationDispatcher();
    tenantPort = new InMemoryNotificationPlatformPort();
    templateRepo = new InMemoryNotificationTemplateRepository();

    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'Lava Car',
      slug: 'lavacar',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      fromEmail: null,
    });
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId: TENANT_ID,
        triggerEvent: NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER,
        channel: 'EMAIL',
        subject: 'Seu agendamento foi confirmado!',
        body: '<p>Olá, {{contactName}}! Data: {{localDate}} Horário: {{localTime}}</p>',
      }),
    );

    useCase = new SendBookingApprovedNotificationUseCase(
      logRepo,
      processedEventRepo,
      dispatcher,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
    );
  });

  it('dispatches confirmation email to customer with timezone-converted time', async () => {
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);

    const msg = dispatcher.dispatched[0];
    expect(msg.to).toBe('joao@example.com');
    expect(msg.subject).toBe('Seu agendamento foi confirmado!');
    expect(msg.channel).toBe('EMAIL');
    // 2026-06-15T16:00:00Z in America/Sao_Paulo (UTC-3) = 13:00
    expect(msg.body).toContain('13:00');
    expect(msg.body).toContain('2026-06-15');

    const logs = logRepo.all;
    expect(logs).toHaveLength(1);
    expect(logs[0].notificationType).toBe('booking-approved-customer');
    expect(logs[0].tenantId).toBe(TENANT_ID);
  });

  it('falls back to America/Sao_Paulo when tenant info is unavailable', async () => {
    const emptyTenantPort = new InMemoryNotificationPlatformPort();
    const uc = new SendBookingApprovedNotificationUseCase(
      logRepo,
      processedEventRepo,
      dispatcher,
      emptyTenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
    );
    const result = await uc.execute(dto);
    expect(result.emailSent).toBe(true);
    expect(dispatcher.dispatched[0].body).toBeDefined();
  });

  it('returns emailSent=false and logs warning when no template found', async () => {
    const emptyTemplateRepo = new InMemoryNotificationTemplateRepository();
    const uc = new SendBookingApprovedNotificationUseCase(
      logRepo,
      processedEventRepo,
      dispatcher,
      tenantPort,
      new InMemoryTransactionManager(),
      emptyTemplateRepo,
    );

    const result = await uc.execute(dto);

    expect(result.emailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
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

  it('saves FAILED log and rethrows when dispatch fails', async () => {
    dispatcher.failNext(new Error('SMTP timeout'));

    await expect(useCase.execute(dto)).rejects.toThrow('SMTP timeout');

    expect(dispatcher.dispatched).toHaveLength(0);
    const logs = logRepo.all;
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('FAILED');
    expect(logs[0].errorMessage).toContain('SMTP timeout');
    const isDup = await processedEventRepo.isDuplicate(
      EVENT_ID,
      'booking-approved-customer',
      'EMAIL',
    );
    expect(isDup).toBe(false);
  });
});
