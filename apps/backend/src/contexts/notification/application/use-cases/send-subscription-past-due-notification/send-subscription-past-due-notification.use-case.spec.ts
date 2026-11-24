import { SendSubscriptionPastDueNotificationDtoBuilder } from '../../../../../test/builders/notification';
import {
  BillingNotificationFixture,
  BILLING_FIXTURE_TENANT_ID,
} from '../../../../../test/utils/billing-notification-fixture';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendSubscriptionPastDueNotificationUseCase } from './send-subscription-past-due-notification.use-case';

describe('SendSubscriptionPastDueNotificationUseCase', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendSubscriptionPastDueNotificationUseCase;

  const dto = (): SendSubscriptionPastDueNotificationDtoBuilder =>
    new SendSubscriptionPastDueNotificationDtoBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendSubscriptionPastDueNotificationUseCase);
  });

  it('names the day the suspension starts in the tenant timezone and links the billing page', async () => {
    // 02:00 UTC on the 21st is 23:00 on the 20th in America/Sao_Paulo.
    await useCase.execute(dto().withSuspendsAt('2026-12-21T02:00:00.000Z').build());

    const [message] = fixture.dispatcher.dispatched;
    expect(message!.notificationType).toBe(NotificationTemplateKey.SUBSCRIPTION_PAST_DUE);
    expect(message!.body).toContain('20/12/2026');
    expect(message!.body).toContain('/dashboard/billing');
  });
});
