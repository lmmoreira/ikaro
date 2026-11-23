import { SendChargePaidNotificationDtoBuilder } from '../../../../../test/builders/notification';
import {
  BillingNotificationFixture,
  BILLING_FIXTURE_TENANT_ID,
} from '../../../../../test/utils/billing-notification-fixture';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendChargePaidNotificationUseCase } from './send-charge-paid-notification.use-case';

const nbsp = (text: string): string => text.replace(/\u00a0/g, ' ');

describe('SendChargePaidNotificationUseCase', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendChargePaidNotificationUseCase;

  const dto = (): SendChargePaidNotificationDtoBuilder =>
    new SendChargePaidNotificationDtoBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendChargePaidNotificationUseCase);
  });

  it('sends the receipt with the amount and the tenant-local paid date', async () => {
    await useCase.execute(dto().withPaidAt('2026-12-10T02:30:00.000Z').build());

    const [message] = fixture.dispatcher.dispatched;
    expect(message!.notificationType).toBe(NotificationTemplateKey.CHARGE_PAID);
    expect(nbsp(message!.body)).toContain('R$ 49,00');
    // 02:30 UTC is still the 9th in America/Sao_Paulo.
    expect(message!.body).toContain('09/12/2026');
  });
});
