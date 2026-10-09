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
import { SendRecurringScheduleCreatedNotificationUseCase } from './send-recurring-schedule-created-notification.use-case';

const baseInput = {
  tenantId: RECURRING_TENANT_ID,
  eventId: RECURRING_EVENT_ID,
  correlationId: 'corr-recurring-1',
  customerId: RECURRING_CUSTOMER_ID,
  serviceId: RECURRING_SERVICE_ID,
  daysOfWeek: ['wednesday', 'monday'],
  startTime: '10:00',
  startsOn: '2026-09-01',
  endsOn: '2026-11-24',
};

function buildUseCase(fx: RecurringScheduleNotificationFixture) {
  return new SendRecurringScheduleCreatedNotificationUseCase(
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

describe('SendRecurringScheduleCreatedNotificationUseCase', () => {
  let fx: RecurringScheduleNotificationFixture;
  let useCase: SendRecurringScheduleCreatedNotificationUseCase;

  beforeEach(() => {
    fx = new RecurringScheduleNotificationFixture();
    useCase = buildUseCase(fx);
  });

  it('sends the pt-BR confirmation to the customer and logs it', async () => {
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_CREATED_CUSTOMER);

    const result = await useCase.execute(baseInput);

    expect(result.emailSent).toBe(true);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
    const message = fx.dispatcher.dispatched[0];
    expect(message.to).toBe(RECURRING_CUSTOMER_EMAIL);
    expect(message.subject).toBe('Sua recorrência foi confirmada');
    expect(message.body).toContain('Maria Souza');
    expect(message.body).toContain('Lava Car');
    expect(message.body).toContain('Aula de Yoga');
    expect(message.body).toContain('segunda-feira e quarta-feira');
    expect(message.body).toContain('10:00');
    expect(message.body).toContain('01/09/2026');
    expect(message.body).toContain('24/11/2026');
    expect(fx.logRepo.all.map((l) => l.notificationType)).toEqual([
      'recurring-schedule-created-customer',
    ]);
  });

  it('uses the tenant locale (en)', async () => {
    fx = new RecurringScheduleNotificationFixture('en');
    useCase = buildUseCase(fx);
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_CREATED_CUSTOMER);

    await useCase.execute(baseInput);

    const message = fx.dispatcher.dispatched[0];
    expect(message.subject).toBe('Your recurring schedule is confirmed');
    expect(message.body).toContain('Monday and Wednesday');
    expect(message.body).toContain('09/01/2026');
  });

  it('shows no internal identifier', async () => {
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_CREATED_CUSTOMER);

    await useCase.execute(baseInput);

    const { body } = fx.dispatcher.dispatched[0];
    for (const internal of [RECURRING_CUSTOMER_ID, RECURRING_SERVICE_ID, 'approvedByStaffId']) {
      expect(body).not.toContain(internal);
    }
  });

  it('sends nothing on a second delivery of the same event', async () => {
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_CREATED_CUSTOMER);

    await useCase.execute(baseInput);
    const second = await useCase.execute(baseInput);

    expect(second.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
  });

  it('skips without failing when the customer no longer exists', async () => {
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_CREATED_CUSTOMER);

    const result = await useCase.execute({ ...baseInput, customerId: 'missing-customer' });

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
    expect(fx.logRepo.all).toHaveLength(0);
  });

  it('skips without failing when the service no longer exists', async () => {
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_CREATED_CUSTOMER);

    const result = await useCase.execute({ ...baseInput, serviceId: 'missing-service' });

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
  });

  it('skips when the tenant has no template row', async () => {
    const result = await useCase.execute(baseInput);

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
  });

  it('never resolves another tenant data (tenant isolation)', async () => {
    fx.seedTemplate(
      NotificationTemplateKey.RECURRING_SCHEDULE_CREATED_CUSTOMER,
      RECURRING_OTHER_TENANT_ID,
    );

    const result = await useCase.execute({ ...baseInput, tenantId: RECURRING_OTHER_TENANT_ID });

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
    expect(fx.logRepo.all).toHaveLength(0);
  });

  it('escapes the tenant name', async () => {
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_CREATED_CUSTOMER);
    fx.tenantPort.setTenantInfo(RECURRING_TENANT_ID, {
      id: RECURRING_TENANT_ID,
      name: 'Lava <img src=x>',
      slug: 'lavacar',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      replyToEmail: null,
    });

    await useCase.execute(baseInput);

    expect(fx.dispatcher.dispatched[0].body).not.toContain('<img');
    expect(fx.dispatcher.dispatched[0].body).toContain('Lava &lt;img src=x&gt;');
  });
});
