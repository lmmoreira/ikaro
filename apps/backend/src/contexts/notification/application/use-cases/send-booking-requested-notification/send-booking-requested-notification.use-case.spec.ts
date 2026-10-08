import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryInboxRepository } from '../../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryNotificationStaffPort } from '../../../../../test/infrastructure/in-memory-notification-staff.port';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { JsonLocalizationAdapter } from '../../../infrastructure/adapters/json-localization.adapter';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendBookingRequestedNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendBookingRequestedNotificationUseCase } from './send-booking-requested-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const EVENT_ID = 'cccccccc-0000-4000-8000-000000000001';

const dto = new SendBookingRequestedNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .build();

describe('SendBookingRequestedNotificationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let inboxRepo: InMemoryInboxRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let staffPort: InMemoryNotificationStaffPort;
  let tenantPort: InMemoryNotificationPlatformPort;
  let templateRepo: InMemoryNotificationTemplateRepository;
  let useCase: SendBookingRequestedNotificationUseCase;

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
        triggerEvent: NotificationTemplateKey.BOOKING_REQUESTED_ADMIN,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
    );
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId: TENANT_ID,
        triggerEvent: NotificationTemplateKey.BOOKING_REQUESTED_CUSTOMER,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
    );
    useCase = new SendBookingRequestedNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      staffPort,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
      new JsonLocalizationAdapter(),
    );
  });

  it('dispatches admin and customer emails and saves two log rows', async () => {
    const result = await useCase.execute(dto);

    expect(result.adminEmailSent).toBe(true);
    expect(result.customerEmailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(2);

    const adminMsg = dispatcher.dispatched.find((m) => m.to === 'manager@lavacar.com.br');
    expect(adminMsg).toBeDefined();
    expect(adminMsg!.body).toContain('Lavagem Completa');
    expect(adminMsg!.body).not.toContain('{{');
    expect(adminMsg!.channel).toBe('EMAIL');

    const customerMsg = dispatcher.dispatched.find((m) => m.to === 'joao@example.com');
    expect(customerMsg).toBeDefined();
    expect(customerMsg!.body).toContain('Lava Car');
    expect(customerMsg!.body).not.toContain('{{');

    const logs = logRepo.all;
    expect(logs).toHaveLength(2);
    const types = logs.map((l) => l.notificationType);
    expect(types).toContain('booking-requested-admin');
    expect(types).toContain('booking-requested-customer');
  });

  it('sends admin email to each manager when multiple managers exist', async () => {
    staffPort.setManagerEmails(TENANT_ID, ['mgr1@lavacar.com.br', 'mgr2@lavacar.com.br']);

    await useCase.execute(dto);

    const adminMsgs = dispatcher.dispatched.filter((m) => m.to !== 'joao@example.com');
    expect(adminMsgs).toHaveLength(2);
    expect(adminMsgs.map((m) => m.to)).toEqual(
      expect.arrayContaining(['mgr1@lavacar.com.br', 'mgr2@lavacar.com.br']),
    );
    const adminLog = logRepo.all.filter((l) => l.notificationType === 'booking-requested-admin');
    // AUD-004 item 3: one log row per recipient now (previously only emails[0] was logged).
    expect(adminLog).toHaveLength(2);
    expect(adminLog.map((l) => l.recipientEmail.address)).toEqual(
      expect.arrayContaining(['mgr1@lavacar.com.br', 'mgr2@lavacar.com.br']),
    );
  });

  it('skips admin email gracefully when no managers exist', async () => {
    staffPort.setManagerEmails(TENANT_ID, []);

    const result = await useCase.execute(dto);

    expect(result.adminEmailSent).toBe(false);
    expect(result.customerEmailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);
    expect(dispatcher.dispatched[0].to).toBe('joao@example.com');
    const adminLog = logRepo.all.filter((l) => l.notificationType === 'booking-requested-admin');
    expect(adminLog).toHaveLength(0);
  });

  it('is idempotent: second call with same eventId dispatches no emails and creates no extra logs', async () => {
    await useCase.execute(dto);
    dispatcher.clear();
    const result = await useCase.execute(dto);

    expect(result.adminEmailSent).toBe(false);
    expect(result.customerEmailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
    expect(logRepo.all).toHaveLength(2);
  });

  it('tenant isolation: log rows are scoped to the correct tenantId', async () => {
    await useCase.execute(dto);
    expect(logRepo.all.every((l) => l.tenantId === TENANT_ID)).toBe(true);
  });

  it('writes the scheduled time in the tenant timezone and format, with no hardcoded connector', async () => {
    await useCase.execute(dto);

    const customerMsg = dispatcher.dispatched.find((m) => m.to === 'joao@example.com');
    expect(customerMsg!.body).toContain('15/06/2026 10:00');
    expect(customerMsg!.body).not.toContain(' às ');
  });

  it('gives the manager the pickup address when the booking has one', async () => {
    const withPickup = new SendBookingRequestedNotificationDtoBuilder()
      .withTenantId(TENANT_ID)
      .withEventId(EVENT_ID)
      .withPickupAddress({
        street: 'Rua das Flores',
        number: '10',
        complement: null,
        neighborhood: 'Centro',
        city: 'Belo Horizonte',
        state: 'MG',
        zipCode: '30110-000',
      })
      .build();

    await useCase.execute(withPickup);

    const adminMsg = dispatcher.dispatched.find((m) => m.to === 'manager@lavacar.com.br');
    const customerMsg = dispatcher.dispatched.find((m) => m.to === 'joao@example.com');
    expect(adminMsg!.body).toContain(
      '<strong>Endereço de retirada:</strong> Rua das Flores, 10, Centro, Belo Horizonte - MG, 30110-000',
    );
    expect(adminMsg!.body).not.toContain('{"street"');
    expect(customerMsg!.body).not.toContain('Rua das Flores');
  });

  it('leaves the pickup line out when the booking has no pickup address', async () => {
    await useCase.execute(dto);

    const adminMsg = dispatcher.dispatched.find((m) => m.to === 'manager@lavacar.com.br');
    expect(adminMsg!.body).not.toContain('Endereço de retirada');
  });

  it('escapes the customer name', async () => {
    const hostile = new SendBookingRequestedNotificationDtoBuilder()
      .withTenantId(TENANT_ID)
      .withEventId(EVENT_ID)
      .withContactName('<img src=x onerror=1>')
      .build();

    await useCase.execute(hostile);

    for (const msg of dispatcher.dispatched) expect(msg.body).not.toContain('<img');
  });

  it('escapes the tenant name in the customer email', async () => {
    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'Lava <img src=x>',
      slug: 'lavacar',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      replyToEmail: null,
    });

    await useCase.execute(dto);

    const customerMsg = dispatcher.dispatched.find((m) => m.to === 'joao@example.com');
    expect(customerMsg!.body).not.toContain('<img');
    expect(customerMsg!.body).toContain('Lava &lt;img src=x&gt;');
  });
});
