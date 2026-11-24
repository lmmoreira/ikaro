import { SendSubscriptionSuspendedNotificationDtoBuilder } from '../../../../../test/builders/notification';
import {
  BillingNotificationFixture,
  BILLING_FIXTURE_TENANT_ID,
} from '../../../../../test/utils/billing-notification-fixture';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendSubscriptionSuspendedNotificationUseCase } from './send-subscription-suspended-notification.use-case';

describe('SendSubscriptionSuspendedNotificationUseCase', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendSubscriptionSuspendedNotificationUseCase;

  const dto = (): SendSubscriptionSuspendedNotificationDtoBuilder =>
    new SendSubscriptionSuspendedNotificationDtoBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendSubscriptionSuspendedNotificationUseCase);
  });

  it.each(['NON_PAYMENT', 'PAYMENT_REVERSED'] as const)(
    'a %s suspension sends the pay-one-month email with the clean-up date and the billing page, not a payment link',
    async (reason) => {
      await useCase.execute(
        dto().withReason(reason).withPurgeAt('2027-03-20T15:00:00.000Z').build(),
      );

      const [message] = fixture.dispatcher.dispatched;
      expect(message!.notificationType).toBe(
        NotificationTemplateKey.SUBSCRIPTION_SUSPENDED_NON_PAYMENT,
      );
      expect(message!.body).toContain('20/03/2027');
      expect(message!.body).toContain('o link de pagamento chega no próximo e-mail');
      expect(message!.body).toContain('Dados de cobrança');
      expect(message!.body).toContain('/dashboard/billing');
    },
  );

  it('an OPERATOR suspension tells the manager to contact Ikaro, with no link at all', async () => {
    await useCase.execute(dto().withReason('OPERATOR').build());

    const [message] = fixture.dispatcher.dispatched;
    expect(message!.notificationType).toBe(NotificationTemplateKey.SUBSCRIPTION_SUSPENDED_OPERATOR);
    expect(message!.body).toContain('Entre em contato com a Ikaro');
    expect(message!.body).not.toContain('href=');
  });

  it('a CANCELED suspension sends nothing and writes no log row: the cancellation email already told the manager', async () => {
    const result = await useCase.execute(
      dto().withReason('CANCELED').withRecipientEmail(null).build(),
    );

    expect(result).toEqual({ emailSent: false });
    expect(fixture.dispatcher.dispatched).toEqual([]);
    expect(fixture.logRepo.all).toEqual([]);
  });
});
