import { SendPriceChangeAnnouncedNotificationDtoBuilder } from '../../../../../test/builders/notification';
import {
  BillingNotificationFixture,
  BILLING_FIXTURE_TENANT_ID,
} from '../../../../../test/utils/billing-notification-fixture';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendPriceChangeAnnouncedNotificationUseCase } from './send-price-change-announced-notification.use-case';

const nbsp = (text: string): string => text.replace(/\u00a0/g, ' ');

describe('SendPriceChangeAnnouncedNotificationUseCase', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendPriceChangeAnnouncedNotificationUseCase;

  const dto = (): SendPriceChangeAnnouncedNotificationDtoBuilder =>
    new SendPriceChangeAnnouncedNotificationDtoBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendPriceChangeAnnouncedNotificationUseCase);
  });

  it('lists each changed item by its localized name with the old and the new amount, then the new total and the date', async () => {
    await useCase.execute(
      dto()
        .withChanges([
          { featureKey: 'BOOKING', tier: 'STANDARD', oldAmountMinor: 3900, newAmountMinor: 4900 },
          { featureKey: 'CHATBOT', tier: 'PLUS', oldAmountMinor: 9900, newAmountMinor: 12900 },
        ])
        .withNewMonthlyTotalMinor(17800)
        .withEffectiveFrom('2026-12-10')
        .build(),
    );

    const [message] = fixture.dispatcher.dispatched;
    const body = nbsp(message!.body);
    expect(message!.notificationType).toBe(
      NotificationTemplateKey.SUBSCRIPTION_PRICE_CHANGE_ANNOUNCED,
    );
    expect(body).toContain('<li>Agendamento online: R$ 39,00 → R$ 49,00</li>');
    expect(body).toContain('<li>Assistente virtual (PLUS): R$ 99,00 → R$ 129,00</li>');
    expect(body).toContain('R$ 178,00');
    expect(body).toContain('10/12/2026');
  });

  it('falls back to the raw feature key, escaped, when a feature has no label', async () => {
    await useCase.execute(
      dto()
        .withChanges([
          {
            featureKey: 'NEW<FEATURE>',
            tier: 'STANDARD',
            oldAmountMinor: 100,
            newAmountMinor: 200,
          },
        ])
        .build(),
    );

    expect(fixture.dispatcher.dispatched[0]!.body).toContain('<li>NEW&lt;FEATURE&gt;:');
  });

  it('writes the English labels for an English tenant', async () => {
    fixture.setTenant(BILLING_FIXTURE_TENANT_ID, 'en');

    await useCase.execute(dto().build());

    expect(fixture.dispatcher.dispatched[0]!.body).toContain(
      '<li>Online booking: R$39.00 → R$49.00</li>',
    );
  });
});
