import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryInboxRepository } from '../../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryNotificationStaffPort } from '../../../../../test/infrastructure/in-memory-notification-staff.port';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { JsonLocalizationAdapter } from '../../../infrastructure/adapters/json-localization.adapter';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendBookingCancelledNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendBookingCancelledNotificationUseCase } from './send-booking-cancelled-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const EVENT_ID = 'cccccccc-0001-4000-8000-000000000001';

const dto = new SendBookingCancelledNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .build();

describe('SendBookingCancelledNotificationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let inboxRepo: InMemoryInboxRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let staffPort: InMemoryNotificationStaffPort;
  let tenantPort: InMemoryNotificationPlatformPort;
  let templateRepo: InMemoryNotificationTemplateRepository;
  let useCase: SendBookingCancelledNotificationUseCase;

  beforeEach(() => {
    logRepo = new InMemoryNotificationLogRepository();
    inboxRepo = new InMemoryInboxRepository();
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
      replyToEmail: null,
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
    });
    templateRepo = new InMemoryNotificationTemplateRepository();
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId: TENANT_ID,
        triggerEvent: NotificationTemplateKey.BOOKING_CANCELLED_CUSTOMER,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
    );
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId: TENANT_ID,
        triggerEvent: NotificationTemplateKey.BOOKING_CANCELLED_ADMIN,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
    );
    const localizationPort = new JsonLocalizationAdapter();
    useCase = new SendBookingCancelledNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      staffPort,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
      localizationPort,
    );
  });

  it('dispatches customer and admin emails and saves two log rows', async () => {
    const result = await useCase.execute(dto);

    expect(result.customerEmailSent).toBe(true);
    expect(result.adminEmailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(2);

    const customerMsg = dispatcher.dispatched.find((m) => m.to === 'joao@example.com');
    expect(customerMsg).toBeDefined();
    expect(customerMsg!.subject).toBe('Seu agendamento foi cancelado');
    expect(customerMsg!.body).toContain('João Silva');
    expect(customerMsg!.body).toContain('Lavagem Completa');
    expect(customerMsg!.body).not.toContain('{{');

    const adminMsg = dispatcher.dispatched.find((m) => m.to === 'manager@lavacar.com.br');
    expect(adminMsg).toBeDefined();
    expect(adminMsg!.subject).toBe('Agendamento cancelado');
    expect(adminMsg!.body).not.toContain('{{');

    const logs = logRepo.all;
    expect(logs).toHaveLength(2);
    const types = logs.map((l) => l.notificationType);
    expect(types).toContain('booking-cancelled-customer');
    expect(types).toContain('booking-cancelled-admin');
  });

  it('dispatches nothing when the occurrence was cancelled by its schedule ending', async () => {
    const endedWithSchedule = new SendBookingCancelledNotificationDtoBuilder()
      .withTenantId(TENANT_ID)
      .withEventId(EVENT_ID)
      .withCancelledByScheduleEnd(true)
      .build();

    const result = await useCase.execute(endedWithSchedule);

    expect(result).toEqual({ customerEmailSent: false, adminEmailSent: false });
    expect(dispatcher.dispatched).toHaveLength(0);
    expect(logRepo.all).toHaveLength(0);
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
    await inboxRepo.markProcessed(EVENT_ID, 'booking-cancelled-customer:EMAIL');

    const result = await useCase.execute(dto);

    expect(result.customerEmailSent).toBe(false);
    expect(result.adminEmailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);
    expect(dispatcher.dispatched[0].to).toBe('manager@lavacar.com.br');
  });

  it('sends only customer email when admin already processed (partial retry)', async () => {
    // AUD-004 item 3: the admin claim is now per-recipient (type:channel:email), not per-batch.
    await inboxRepo.markProcessed(EVENT_ID, 'booking-cancelled-admin:EMAIL:manager@lavacar.com.br');

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

  it('writes the date and time in the tenant timezone and format', async () => {
    await useCase.execute(dto);
    const customerMsg = dispatcher.dispatched.find((m) => m.to === 'joao@example.com');
    expect(customerMsg!.body).toContain('<strong>Data:</strong> 01/07/2026');
    expect(customerMsg!.body).toContain('<strong>Horário:</strong> 10:00');
    expect(customerMsg!.body).not.toContain('2026-07-01');
  });

  it('tells the manager the business cancelled, with the reason', async () => {
    await useCase.execute(dto);

    const adminMsg = dispatcher.dispatched.find((m) => m.to === 'manager@lavacar.com.br');
    expect(adminMsg!.body).toContain('Cancelado pelo estabelecimento.');
    expect(adminMsg!.body).toContain('<p><strong>Motivo:</strong> Unavailability</p>');
  });

  it('tells the manager the customer cancelled, and omits the reason line when none was given', async () => {
    const byCustomer = new SendBookingCancelledNotificationDtoBuilder()
      .withTenantId(TENANT_ID)
      .withEventId(EVENT_ID)
      .withIsBusiness(false)
      .withReason(null)
      .build();

    await useCase.execute(byCustomer);

    const adminMsg = dispatcher.dispatched.find((m) => m.to === 'manager@lavacar.com.br');
    expect(adminMsg!.body).toContain('Cancelado pelo cliente.');
    expect(adminMsg!.body).not.toContain('Motivo');
  });

  it('gives the customer the reason when the business cancelled', async () => {
    await useCase.execute(dto);

    const customerMsg = dispatcher.dispatched.find((m) => m.to === 'joao@example.com');
    expect(customerMsg!.body).toContain('<p><strong>Motivo:</strong> Unavailability</p>');
  });

  it('does not repeat to the customer the reason they gave for their own cancellation', async () => {
    const byCustomer = new SendBookingCancelledNotificationDtoBuilder()
      .withTenantId(TENANT_ID)
      .withEventId(EVENT_ID)
      .withIsBusiness(false)
      .withReason('Changed my mind')
      .build();

    await useCase.execute(byCustomer);

    const customerMsg = dispatcher.dispatched.find((m) => m.to === 'joao@example.com');
    const adminMsg = dispatcher.dispatched.find((m) => m.to === 'manager@lavacar.com.br');
    expect(customerMsg!.body).not.toContain('Motivo');
    expect(adminMsg!.body).toContain('Changed my mind');
  });

  it('writes the English copy, US date and 12-hour clock for an en tenant', async () => {
    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'Lava Car',
      slug: 'lavacar',
      timezone: 'America/Sao_Paulo',
      locale: 'en',
      replyToEmail: null,
    });

    await useCase.execute(dto);

    const customerMsg = dispatcher.dispatched.find((m) => m.to === 'joao@example.com');
    const adminMsg = dispatcher.dispatched.find((m) => m.to === 'manager@lavacar.com.br');
    expect(customerMsg!.body).toContain('<strong>Date:</strong> 07/01/2026');
    expect(customerMsg!.body).toContain('<strong>Time:</strong> 10:00 AM');
    expect(adminMsg!.body).toContain('Cancelled by the business.');
    expect(adminMsg!.body).toContain('<strong>Reason:</strong> Unavailability');
  });

  it('escapes the names and the reason typed by people', async () => {
    const hostile = new SendBookingCancelledNotificationDtoBuilder()
      .withTenantId(TENANT_ID)
      .withEventId(EVENT_ID)
      .withContactName('<img src=x>')
      .withReason('<script>x</script>')
      .build();

    await useCase.execute(hostile);

    for (const msg of dispatcher.dispatched) {
      expect(msg.body).not.toContain('<img');
      expect(msg.body).not.toContain('<script>');
    }
    expect(dispatcher.dispatched.some((m) => m.body.includes('&lt;img src=x&gt;'))).toBe(true);
  });

  it('falls back to America/Sao_Paulo timezone when tenant info is not found', async () => {
    const unknownTenantDto = new SendBookingCancelledNotificationDtoBuilder()
      .withTenantId('ffffffff-0000-4000-8000-000000000099')
      .withEventId('cccccccc-0099-4000-8000-000000000001')
      .build();

    await expect(useCase.execute(unknownTenantDto)).resolves.not.toThrow();
  });
});
