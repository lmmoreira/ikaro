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
import { SendRecurringScheduleRejectedNotificationUseCase } from './send-recurring-schedule-rejected-notification.use-case';

const baseInput = {
  tenantId: RECURRING_TENANT_ID,
  eventId: RECURRING_EVENT_ID,
  correlationId: 'corr-recurring-1',
  customerId: RECURRING_CUSTOMER_ID,
  serviceId: RECURRING_SERVICE_ID,
  reason: 'APPROVAL_REJECTED' as 'APPROVAL_REJECTED' | 'APPROVAL_EXPIRED',
};

function buildUseCase(fx: RecurringScheduleNotificationFixture) {
  return new SendRecurringScheduleRejectedNotificationUseCase(
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

describe('SendRecurringScheduleRejectedNotificationUseCase', () => {
  let fx: RecurringScheduleNotificationFixture;
  let useCase: SendRecurringScheduleRejectedNotificationUseCase;

  beforeEach(() => {
    fx = new RecurringScheduleNotificationFixture();
    useCase = buildUseCase(fx);
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_REJECTED_CUSTOMER).seedTemplate(
      NotificationTemplateKey.RECURRING_SCHEDULE_EXPIRED_CUSTOMER,
    );
  });

  it('sends the rejected email for APPROVAL_REJECTED', async () => {
    const result = await useCase.execute(baseInput);

    expect(result.emailSent).toBe(true);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
    const message = fx.dispatcher.dispatched[0];
    expect(message.to).toBe(RECURRING_CUSTOMER_EMAIL);
    expect(message.subject).toBe('Sua solicitação de recorrência não foi aceita');
    expect(message.body).toContain('Aula de Yoga');
    expect(fx.logRepo.all.map((l) => l.notificationType)).toEqual([
      'recurring-schedule-rejected-customer',
    ]);
  });

  it('sends the different expired email for APPROVAL_EXPIRED', async () => {
    const result = await useCase.execute({ ...baseInput, reason: 'APPROVAL_EXPIRED' });

    expect(result.emailSent).toBe(true);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
    const message = fx.dispatcher.dispatched[0];
    expect(message.subject).toBe('Sua solicitação de recorrência expirou');
    expect(message.body).toContain('Nenhum horário foi reservado');
    expect(message.body).toContain('solicitar novamente');
    expect(fx.logRepo.all.map((l) => l.notificationType)).toEqual([
      'recurring-schedule-expired-customer',
    ]);
  });

  it('uses the tenant locale (en)', async () => {
    fx = new RecurringScheduleNotificationFixture('en');
    useCase = buildUseCase(fx);
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_REJECTED_CUSTOMER).seedTemplate(
      NotificationTemplateKey.RECURRING_SCHEDULE_EXPIRED_CUSTOMER,
    );

    await useCase.execute({ ...baseInput, reason: 'APPROVAL_EXPIRED' });

    expect(fx.dispatcher.dispatched[0].subject).toBe('Your recurring schedule request expired');
  });

  it('never names a staff member or shows an internal identifier', async () => {
    await useCase.execute(baseInput);
    await useCase.execute({ ...baseInput, eventId: 'another-event', reason: 'APPROVAL_EXPIRED' });

    for (const { body } of fx.dispatcher.dispatched) {
      for (const internal of [RECURRING_CUSTOMER_ID, RECURRING_SERVICE_ID, 'approvedByStaffId']) {
        expect(body).not.toContain(internal);
      }
    }
  });

  it('sends nothing on a second delivery of the same event', async () => {
    await useCase.execute(baseInput);
    const second = await useCase.execute(baseInput);

    expect(second.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
  });

  it('skips without failing when the customer no longer exists', async () => {
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_REJECTED_CUSTOMER);

    const result = await useCase.execute({ ...baseInput, customerId: 'missing-customer' });

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
    expect(fx.logRepo.all).toHaveLength(0);
  });

  it('skips without failing when the service no longer exists', async () => {
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_REJECTED_CUSTOMER);

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
      NotificationTemplateKey.RECURRING_SCHEDULE_REJECTED_CUSTOMER,
      RECURRING_OTHER_TENANT_ID,
    );

    const result = await useCase.execute({ ...baseInput, tenantId: RECURRING_OTHER_TENANT_ID });

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
    expect(fx.logRepo.all).toHaveLength(0);
  });
});
