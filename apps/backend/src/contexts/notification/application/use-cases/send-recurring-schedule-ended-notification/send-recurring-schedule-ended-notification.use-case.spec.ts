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
import { SendRecurringScheduleEndedNotificationUseCase } from './send-recurring-schedule-ended-notification.use-case';

const baseInput = {
  tenantId: RECURRING_TENANT_ID,
  eventId: RECURRING_EVENT_ID,
  correlationId: 'corr-recurring-1',
  customerId: RECURRING_CUSTOMER_ID,
  serviceId: RECURRING_SERVICE_ID,
  endedBy: 'CUSTOMER' as 'CUSTOMER' | 'STAFF',
};

function buildUseCase(fx: RecurringScheduleNotificationFixture) {
  return new SendRecurringScheduleEndedNotificationUseCase(
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

describe('SendRecurringScheduleEndedNotificationUseCase', () => {
  let fx: RecurringScheduleNotificationFixture;
  let useCase: SendRecurringScheduleEndedNotificationUseCase;

  beforeEach(() => {
    fx = new RecurringScheduleNotificationFixture();
    useCase = buildUseCase(fx);
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_CUSTOMER).seedTemplate(
      NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_BY_STAFF_CUSTOMER,
    );
  });

  it('confirms to the customer who ended the schedule themselves', async () => {
    const result = await useCase.execute(baseInput);

    expect(result.emailSent).toBe(true);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
    const message = fx.dispatcher.dispatched[0];
    expect(message.to).toBe(RECURRING_CUSTOMER_EMAIL);
    expect(message.subject).toBe('Sua recorrência foi encerrada');
    expect(message.body).toContain('Você encerrou');
    expect(message.body).toContain('Aula de Yoga');
    expect(fx.logRepo.all.map((l) => l.notificationType)).toEqual([
      'recurring-schedule-ended-customer',
    ]);
  });

  it('tells the customer the business ended it when staff did', async () => {
    await useCase.execute({ ...baseInput, endedBy: 'STAFF' });

    expect(fx.dispatcher.dispatched).toHaveLength(1);
    const message = fx.dispatcher.dispatched[0];
    expect(message.subject).toBe('Sua recorrência foi encerrada por Lava Car');
    expect(message.body).toContain('foi encerrada por');
    expect(message.body).not.toContain('Você encerrou');
    expect(fx.logRepo.all.map((l) => l.notificationType)).toEqual([
      'recurring-schedule-ended-by-staff-customer',
    ]);
  });

  it('uses the tenant locale (en)', async () => {
    fx = new RecurringScheduleNotificationFixture('en');
    useCase = buildUseCase(fx);
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_CUSTOMER).seedTemplate(
      NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_BY_STAFF_CUSTOMER,
    );

    await useCase.execute(baseInput);
    await useCase.execute({ ...baseInput, eventId: 'another-event', endedBy: 'STAFF' });

    expect(fx.dispatcher.dispatched.map((m) => m.subject)).toEqual([
      'Your recurring schedule was ended',
      'Your recurring schedule was ended by Lava Car',
    ]);
  });

  it('shows no staff name, booking id or internal identifier', async () => {
    await useCase.execute({ ...baseInput, endedBy: 'STAFF' });

    const { body } = fx.dispatcher.dispatched[0];
    for (const internal of [RECURRING_CUSTOMER_ID, RECURRING_SERVICE_ID]) {
      expect(body).not.toContain(internal);
    }
  });

  it('sends nothing on a second delivery of the same event', async () => {
    await useCase.execute(baseInput);
    const second = await useCase.execute(baseInput);

    expect(second.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
  });

  it('skips without failing when the customer no longer exists', async () => {
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_CUSTOMER);

    const result = await useCase.execute({ ...baseInput, customerId: 'missing-customer' });

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
    expect(fx.logRepo.all).toHaveLength(0);
  });

  it('skips without failing when the service no longer exists', async () => {
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_CUSTOMER);

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
      NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_CUSTOMER,
      RECURRING_OTHER_TENANT_ID,
    );

    const result = await useCase.execute({ ...baseInput, tenantId: RECURRING_OTHER_TENANT_ID });

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
    expect(fx.logRepo.all).toHaveLength(0);
  });
});
