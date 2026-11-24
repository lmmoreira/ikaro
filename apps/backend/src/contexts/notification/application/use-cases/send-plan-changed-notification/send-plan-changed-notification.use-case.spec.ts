import { SendPlanChangedNotificationDtoBuilder } from '../../../../../test/builders/notification';
import {
  BillingNotificationFixture,
  BILLING_FIXTURE_TENANT_ID,
} from '../../../../../test/utils/billing-notification-fixture';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendPlanChangedNotificationUseCase } from './send-plan-changed-notification.use-case';

const nbsp = (text: string): string => text.replace(/\u00a0/g, ' ');

describe('SendPlanChangedNotificationUseCase', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendPlanChangedNotificationUseCase;

  const dto = (): SendPlanChangedNotificationDtoBuilder =>
    new SendPlanChangedNotificationDtoBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendPlanChangedNotificationUseCase);
  });

  it('names the new total from minor units and the billing page, and states no date', async () => {
    await useCase.execute(dto().withNewTotalMinor(12990).build());

    const [message] = fixture.dispatcher.dispatched;
    expect(message!.notificationType).toBe(NotificationTemplateKey.PLAN_CHANGED);
    expect(nbsp(message!.body)).toContain('R$ 129,90');
    expect(message!.body).toContain('/dashboard/billing');
    expect(message!.body).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('writes the total in the currency of the event', async () => {
    fixture.setTenant(BILLING_FIXTURE_TENANT_ID, 'en');

    await useCase.execute(dto().withNewTotalMinor(12990).withCurrency('USD').build());

    expect(fixture.dispatcher.dispatched[0]!.body).toContain('$129.90');
  });
});
