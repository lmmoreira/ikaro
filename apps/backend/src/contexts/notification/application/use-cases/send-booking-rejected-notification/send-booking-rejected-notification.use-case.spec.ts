import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationProcessedEventRepository } from '../../../../../test/repositories/notification/in-memory-processed-event.repository';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendBookingRejectedNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendBookingRejectedNotificationUseCase } from './send-booking-rejected-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0002-4000-8000-000000000001';
const EVENT_ID = 'cccccccc-0002-4000-8000-000000000001';

const dto = new SendBookingRejectedNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .build();

describe('SendBookingRejectedNotificationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let processedEventRepo: InMemoryNotificationProcessedEventRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let templateRepo: InMemoryNotificationTemplateRepository;
  let useCase: SendBookingRejectedNotificationUseCase;

  beforeEach(() => {
    logRepo = new InMemoryNotificationLogRepository();
    processedEventRepo = new InMemoryNotificationProcessedEventRepository();
    dispatcher = new InMemoryNotificationDispatcher();
    templateRepo = new InMemoryNotificationTemplateRepository();
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId: TENANT_ID,
        triggerEvent: NotificationTemplateKey.BOOKING_REJECTED_CUSTOMER,
        channel: 'EMAIL',
        subject: 'Sobre seu pedido de agendamento',
        body: '<p>Olá, {{contactName}}! Motivo: {{reason}}</p>',
      }),
    );
    useCase = new SendBookingRejectedNotificationUseCase(
      logRepo,
      processedEventRepo,
      dispatcher,
      new InMemoryTransactionManager(),
      templateRepo,
    );
  });

  it('dispatches rejection email to customer with rendered subject and body', async () => {
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);

    const msg = dispatcher.dispatched[0];
    expect(msg.to).toBe('joao@example.com');
    expect(msg.subject).toBe('Sobre seu pedido de agendamento');
    expect(msg.channel).toBe('EMAIL');
    expect(msg.body).toContain('João Silva');
    expect(msg.body).toContain(dto.reason);

    expect(logRepo.all).toHaveLength(1);
    expect(logRepo.all[0].notificationType).toBe('booking-rejected-customer');
    expect(logRepo.all[0].tenantId).toBe(TENANT_ID);
  });

  it('returns emailSent=false when no template found', async () => {
    const uc = new SendBookingRejectedNotificationUseCase(
      logRepo,
      processedEventRepo,
      dispatcher,
      new InMemoryTransactionManager(),
      new InMemoryNotificationTemplateRepository(),
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
});
