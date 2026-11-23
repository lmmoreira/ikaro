import { SendSubscriptionCancelledNotificationDtoBuilder } from '../../../../../test/builders/notification';
import {
  BillingNotificationFixture,
  BILLING_FIXTURE_TENANT_ID,
} from '../../../../../test/utils/billing-notification-fixture';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendSubscriptionCancelledNotificationUseCase } from './send-subscription-cancelled-notification.use-case';

describe('SendSubscriptionCancelledNotificationUseCase', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendSubscriptionCancelledNotificationUseCase;

  const dto = (): SendSubscriptionCancelledNotificationDtoBuilder =>
    new SendSubscriptionCancelledNotificationDtoBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendSubscriptionCancelledNotificationUseCase);
  });

  it('an immediate cancel says access has ended', async () => {
    await useCase.execute(dto().withImmediate(true).build());

    const [message] = fixture.dispatcher.dispatched;
    expect(message!.notificationType).toBe(
      NotificationTemplateKey.SUBSCRIPTION_CANCELLED_IMMEDIATE,
    );
    expect(message!.body).toContain('o acesso foi encerrado');
  });

  it('a scheduled cancel says until which tenant-local day the subscription stays active', async () => {
    // 02:00 UTC on 1 Jan is still 31 Dec in America/Sao_Paulo.
    await useCase.execute(
      dto().withImmediate(false).withCancelAt('2027-01-01T02:00:00.000Z').build(),
    );

    const [message] = fixture.dispatcher.dispatched;
    expect(message!.notificationType).toBe(
      NotificationTemplateKey.SUBSCRIPTION_CANCELLED_SCHEDULED,
    );
    expect(message!.body).toContain('31/12/2026');
  });
});
