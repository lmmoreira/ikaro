import {
  RECURRING_CUSTOMER_EMAIL,
  RECURRING_CUSTOMER_ID,
  RECURRING_EVENT_ID,
  RECURRING_OTHER_TENANT_ID,
  RECURRING_SERVICE_ID,
  RECURRING_TENANT_ID,
  RecurringScheduleNotificationFixture,
} from '../../../../../test/utils/recurring-schedule-notification-fixture';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendRecurringScheduleRenewalNotificationUseCase } from './send-recurring-schedule-renewal-notification.use-case';

const SCHEDULE_ID = '55555555-0000-4000-8000-0000000000f1';

const baseInput = {
  tenantId: RECURRING_TENANT_ID,
  eventId: RECURRING_EVENT_ID,
  correlationId: 'corr-renewal-1',
  recurringScheduleId: SCHEDULE_ID,
  customerId: RECURRING_CUSTOMER_ID,
  serviceId: RECURRING_SERVICE_ID,
  daysOfWeek: ['tuesday', 'thursday'],
  startTime: '10:00',
  startsOn: '2026-08-01',
  endsOn: '2026-10-19',
};

function buildUseCase(fx: RecurringScheduleNotificationFixture) {
  return new SendRecurringScheduleRenewalNotificationUseCase(
    fx.logRepo,
    fx.inboxRepo,
    fx.dispatcher,
    fx.customerPort,
    fx.servicePort,
    fx.tenantPort,
    fx.txManager,
    fx.templateRepo,
    fx.localizationPort,
  );
}

describe('SendRecurringScheduleRenewalNotificationUseCase', () => {
  let fx: RecurringScheduleNotificationFixture;
  let useCase: SendRecurringScheduleRenewalNotificationUseCase;

  beforeEach(() => {
    fx = new RecurringScheduleNotificationFixture();
    useCase = buildUseCase(fx);
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_RENEWAL_DUE_CUSTOMER);
  });

  it('tells the customer which reservation ends and when, and links to renewing it (pt-BR)', async () => {
    const result = await useCase.execute(baseInput);

    expect(result.emailSent).toBe(true);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
    const message = fx.dispatcher.dispatched[0];
    expect(message.to).toBe(RECURRING_CUSTOMER_EMAIL);
    expect(message.subject).toBe('Sua reserva recorrente termina em 19/10/2026');
    expect(message.body).toContain('Aula de Yoga');
    expect(message.body).toContain('Maria Souza');
    expect(message.body).toContain('Lava Car');
    expect(message.body).toContain('10:00');
    expect(message.body).toContain(
      `href="https://app.ikaro.test/lavacar/my-account/recurring-schedules/new?renewFrom=${SCHEDULE_ID}"`,
    );
    expect(fx.logRepo.all.map((l) => l.notificationType)).toEqual([
      'recurring-schedule-renewal-due-customer',
    ]);
  });

  it('writes the email in the tenant locale (en)', async () => {
    fx = new RecurringScheduleNotificationFixture('en');
    useCase = buildUseCase(fx);
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_RENEWAL_DUE_CUSTOMER);

    await useCase.execute(baseInput);

    const message = fx.dispatcher.dispatched[0];
    expect(message.subject).toBe('Your recurring reservation ends on 10/19/2026');
    expect(message.body).toContain('Renew my reservation');
  });

  it('shows no internal identifier but the schedule id inside the link', async () => {
    await useCase.execute(baseInput);

    const { body } = fx.dispatcher.dispatched[0];
    expect(body).not.toContain(RECURRING_CUSTOMER_ID);
    expect(body).not.toContain(RECURRING_SERVICE_ID);
    expect(body.split(SCHEDULE_ID)).toHaveLength(2);
  });

  it('sends nothing on a second delivery of the same Command', async () => {
    await useCase.execute(baseInput);
    const second = await useCase.execute(baseInput);

    expect(second.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
  });

  it('skips without failing when the customer no longer exists, so one gone customer cannot fail a batch', async () => {
    const result = await useCase.execute({ ...baseInput, customerId: 'missing-customer' });

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
    expect(fx.logRepo.all).toHaveLength(0);
  });

  it('skips without failing when the service no longer exists', async () => {
    const result = await useCase.execute({ ...baseInput, serviceId: 'missing-service' });

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
  });

  it('skips when the tenant has no template row', async () => {
    fx = new RecurringScheduleNotificationFixture();
    useCase = buildUseCase(fx);

    const result = await useCase.execute(baseInput);

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
  });

  it('never resolves another tenant data (tenant isolation)', async () => {
    fx.seedTemplate(
      NotificationTemplateKey.RECURRING_SCHEDULE_RENEWAL_DUE_CUSTOMER,
      RECURRING_OTHER_TENANT_ID,
    );

    const result = await useCase.execute({ ...baseInput, tenantId: RECURRING_OTHER_TENANT_ID });

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
    expect(fx.logRepo.all).toHaveLength(0);
  });

  it('escapes the tenant name and the service name in the body', async () => {
    fx.tenantPort.setTenantInfo(RECURRING_TENANT_ID, {
      id: RECURRING_TENANT_ID,
      name: 'Lava & <b>Cia</b>',
      slug: 'lavacar',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      replyToEmail: null,
    });

    await useCase.execute(baseInput);

    const { body } = fx.dispatcher.dispatched[0];
    expect(body).toContain('Lava &amp; &lt;b&gt;Cia&lt;/b&gt;');
    expect(body).not.toContain('<b>Cia');
  });
});
