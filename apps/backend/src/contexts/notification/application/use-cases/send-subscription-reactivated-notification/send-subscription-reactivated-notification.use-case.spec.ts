import { SendSubscriptionReactivatedNotificationDtoBuilder } from '../../../../../test/builders/notification';
import {
  BillingNotificationFixture,
  BILLING_FIXTURE_TENANT_ID,
} from '../../../../../test/utils/billing-notification-fixture';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendSubscriptionReactivatedNotificationUseCase } from './send-subscription-reactivated-notification.use-case';

describe('SendSubscriptionReactivatedNotificationUseCase', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendSubscriptionReactivatedNotificationUseCase;

  const dto = (): SendSubscriptionReactivatedNotificationDtoBuilder =>
    new SendSubscriptionReactivatedNotificationDtoBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendSubscriptionReactivatedNotificationUseCase);
  });

  it('tells the managers when the billing email is unset and the subscription is not exempt', async () => {
    const result = await useCase.execute(dto().withRecipientEmail(null).withExempt(false).build());

    expect(result).toEqual({ emailSent: true });
    expect(fixture.dispatcher.dispatched.map((m) => m.to).sort()).toEqual([
      'ana@example.com',
      'bruno@example.com',
    ]);
    expect(fixture.dispatcher.dispatched[0]!.notificationType).toBe(
      NotificationTemplateKey.SUBSCRIPTION_REACTIVATED,
    );
  });

  it('sends nothing and writes no log row for an exempt subscription, even with no recipientEmail', async () => {
    const result = await useCase.execute(dto().withRecipientEmail(null).withExempt(true).build());

    expect(result).toEqual({ emailSent: false });
    expect(fixture.dispatcher.dispatched).toEqual([]);
    expect(fixture.logRepo.all).toEqual([]);
  });
});
