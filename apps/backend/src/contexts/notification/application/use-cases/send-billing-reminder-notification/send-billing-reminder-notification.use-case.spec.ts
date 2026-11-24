import { SendBillingReminderNotificationDtoBuilder } from '../../../../../test/builders/notification';
import {
  BillingNotificationFixture,
  BILLING_FIXTURE_TENANT_ID,
} from '../../../../../test/utils/billing-notification-fixture';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendBillingReminderNotificationUseCase } from './send-billing-reminder-notification.use-case';

const nbsp = (text: string): string => text.replace(/\u00a0/g, ' ');

describe('SendBillingReminderNotificationUseCase', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendBillingReminderNotificationUseCase;

  const dto = (): SendBillingReminderNotificationDtoBuilder =>
    new SendBillingReminderNotificationDtoBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendBillingReminderNotificationUseCase);
  });

  it.each([
    ['CHARGE_DUE_SOON', NotificationTemplateKey.BILLING_REMINDER_CHARGE_DUE_SOON],
    ['CHARGE_OVERDUE', NotificationTemplateKey.BILLING_REMINDER_CHARGE_OVERDUE],
    ['RECOVERY_CHARGE_OPEN', NotificationTemplateKey.BILLING_REMINDER_RECOVERY_CHARGE_OPEN],
  ] as const)(
    'a %s reminder picks its own key and carries the amount, the due date and the tolerant sentence',
    async (kind, key) => {
      await useCase.execute(
        dto().withKind(kind).withDueDate('2026-12-10').withAmountMinor(4900).build(),
      );

      const [message] = fixture.dispatcher.dispatched;
      expect(message!.notificationType).toBe(key);
      expect(nbsp(message!.body)).toContain('R$ 49,00');
      expect(message!.body).toContain('10/12/2026');
      expect(message!.body).toContain('Se você já pagou, desconsidere este aviso.');
    },
  );

  it.each([
    ['PLAN_CONFIRMATION', NotificationTemplateKey.BILLING_REMINDER_PLAN_CONFIRMATION],
    ['TRIAL_ENDING', NotificationTemplateKey.BILLING_REMINDER_TRIAL_ENDING],
  ] as const)(
    'a %s reminder names the trial end date and links the billing page',
    async (kind, key) => {
      await useCase.execute(
        dto()
          .withKind(kind)
          .withTrialEndsOn('2026-12-31')
          .withDueDate(null)
          .withAmountMinor(null)
          .withCurrency(null)
          .build(),
      );

      const [message] = fixture.dispatcher.dispatched;
      expect(message!.notificationType).toBe(key);
      expect(message!.body).toContain('31/12/2026');
      expect(message!.body).toContain('/dashboard/billing');
    },
  );

  it.each([
    [
      'a charge reminder without its due date',
      () => dto().withKind('CHARGE_OVERDUE').withDueDate(null),
    ],
    [
      'a charge reminder without its amount',
      () => dto().withKind('CHARGE_DUE_SOON').withAmountMinor(null),
    ],
    [
      'a charge reminder without its currency',
      () => dto().withKind('RECOVERY_CHARGE_OPEN').withCurrency(null),
    ],
    [
      'a trial reminder without the trial end date',
      () => dto().withKind('TRIAL_ENDING').withTrialEndsOn(null),
    ],
  ])('throws instead of sending a blank email for %s', async (_name, build) => {
    await expect(useCase.execute(build().build())).rejects.toThrow('is missing');

    expect(fixture.dispatcher.dispatched).toEqual([]);
  });

  it.each(['CHARGE_DUE_SOON', 'CHARGE_OVERDUE', 'RECOVERY_CHARGE_OPEN'] as const)(
    'a %s reminder carries the English tolerant sentence for an English tenant',
    async (kind) => {
      fixture.setTenant(BILLING_FIXTURE_TENANT_ID, 'en');

      await useCase.execute(dto().withKind(kind).build());

      expect(fixture.dispatcher.dispatched[0]!.body).toContain(
        'If you have already paid, please disregard this notice.',
      );
    },
  );
});
