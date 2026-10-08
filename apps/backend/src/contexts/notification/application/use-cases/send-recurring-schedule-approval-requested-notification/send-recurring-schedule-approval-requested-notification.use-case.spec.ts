import {
  RECURRING_CUSTOMER_EMAIL,
  RECURRING_CUSTOMER_ID,
  RECURRING_EVENT_ID,
  RECURRING_MANAGER_EMAIL,
  RECURRING_OTHER_TENANT_ID,
  RECURRING_SERVICE_ID,
  RECURRING_TENANT_ID,
  RecurringScheduleNotificationFixture,
} from '../../../../../test/utils/recurring-schedule-notification-fixture';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendRecurringScheduleApprovalRequestedNotificationUseCase } from './send-recurring-schedule-approval-requested-notification.use-case';

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
  approvalHoldExpiresAt: '2026-09-03T15:30:00.000Z',
};

function buildUseCase(fx: RecurringScheduleNotificationFixture) {
  return new SendRecurringScheduleApprovalRequestedNotificationUseCase(
    fx.logRepo,
    fx.inboxRepo,
    fx.dispatcher,
    fx.customerPort,
    fx.servicePort,
    fx.tenantPort,
    fx.staffPort,
    fx.txManager,
    fx.templateRepo,
    fx.localizationPort,
  );
}

describe('SendRecurringScheduleApprovalRequestedNotificationUseCase', () => {
  let fx: RecurringScheduleNotificationFixture;
  let useCase: SendRecurringScheduleApprovalRequestedNotificationUseCase;

  beforeEach(() => {
    fx = new RecurringScheduleNotificationFixture();
    useCase = buildUseCase(fx);
  });

  it('alerts the managers, never the customer', async () => {
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_APPROVAL_REQUESTED_ADMIN);

    const result = await useCase.execute(baseInput);

    expect(result.adminEmailSent).toBe(true);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
    const message = fx.dispatcher.dispatched[0];
    expect(message.to).toBe(RECURRING_MANAGER_EMAIL);
    expect(fx.dispatcher.dispatched.some((m) => m.to === RECURRING_CUSTOMER_EMAIL)).toBe(false);
    expect(message.subject).toBe('Nova recorrência aguardando aprovação');
    expect(message.body).toContain('Maria Souza');
    expect(message.body).toContain('Aula de Yoga');
    expect(message.body).toContain('segunda-feira e quarta-feira');
    expect(message.body).toContain('03/09/2026 12:30');
  });

  it('sends one email per manager', async () => {
    fx.staffPort.setManagerEmails(RECURRING_TENANT_ID, [
      RECURRING_MANAGER_EMAIL,
      'outro@lavacar.com.br',
    ]);
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_APPROVAL_REQUESTED_ADMIN);

    await useCase.execute(baseInput);

    expect(fx.dispatcher.dispatched.map((m) => m.to).sort()).toEqual(
      ['outro@lavacar.com.br', RECURRING_MANAGER_EMAIL].sort(),
    );
  });

  it('sends nothing when the tenant has no manager', async () => {
    fx.staffPort.setManagerEmails(RECURRING_TENANT_ID, []);
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_APPROVAL_REQUESTED_ADMIN);

    const result = await useCase.execute(baseInput);

    expect(result.adminEmailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
  });

  it('uses the tenant locale (en)', async () => {
    fx = new RecurringScheduleNotificationFixture('en');
    useCase = buildUseCase(fx);
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_APPROVAL_REQUESTED_ADMIN);

    await useCase.execute(baseInput);

    expect(fx.dispatcher.dispatched[0].subject).toBe('New recurring schedule awaiting approval');
  });

  it('sends nothing to a manager already served on a second delivery', async () => {
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_APPROVAL_REQUESTED_ADMIN);

    await useCase.execute(baseInput);
    const second = await useCase.execute(baseInput);

    expect(second.adminEmailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
  });

  it('shows no internal identifier', async () => {
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_APPROVAL_REQUESTED_ADMIN);

    await useCase.execute(baseInput);

    const { body } = fx.dispatcher.dispatched[0];
    for (const internal of [RECURRING_CUSTOMER_ID, RECURRING_SERVICE_ID]) {
      expect(body).not.toContain(internal);
    }
  });

  it('skips without failing when the customer no longer exists', async () => {
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_APPROVAL_REQUESTED_ADMIN);

    const result = await useCase.execute({ ...baseInput, customerId: 'missing-customer' });

    expect(result.adminEmailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
    expect(fx.logRepo.all).toHaveLength(0);
  });

  it('skips without failing when the service no longer exists', async () => {
    fx.seedTemplate(NotificationTemplateKey.RECURRING_SCHEDULE_APPROVAL_REQUESTED_ADMIN);

    const result = await useCase.execute({ ...baseInput, serviceId: 'missing-service' });

    expect(result.adminEmailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
  });

  it('skips when the tenant has no template row', async () => {
    const result = await useCase.execute(baseInput);

    expect(result.adminEmailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
  });

  it('never resolves another tenant data (tenant isolation)', async () => {
    fx.seedTemplate(
      NotificationTemplateKey.RECURRING_SCHEDULE_APPROVAL_REQUESTED_ADMIN,
      RECURRING_OTHER_TENANT_ID,
    );

    const result = await useCase.execute({ ...baseInput, tenantId: RECURRING_OTHER_TENANT_ID });

    expect(result.adminEmailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
    expect(fx.logRepo.all).toHaveLength(0);
  });
});
