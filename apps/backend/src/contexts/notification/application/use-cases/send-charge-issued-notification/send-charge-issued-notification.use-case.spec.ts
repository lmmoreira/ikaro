import { SendChargeIssuedNotificationDtoBuilder } from '../../../../../test/builders/notification';
import {
  BillingNotificationFixture,
  BILLING_FIXTURE_TENANT_ID,
} from '../../../../../test/utils/billing-notification-fixture';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendChargeIssuedNotificationUseCase } from './send-charge-issued-notification.use-case';

const nbsp = (text: string): string => text.replace(/\u00a0/g, ' ');

describe('SendChargeIssuedNotificationUseCase', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendChargeIssuedNotificationUseCase;

  const dto = (): SendChargeIssuedNotificationDtoBuilder =>
    new SendChargeIssuedNotificationDtoBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendChargeIssuedNotificationUseCase);
  });

  it('sends the period invoice with the amount, the due date, the payment link and the tolerant sentence', async () => {
    await useCase.execute(dto().withKind('PERIOD').withDueDate('2026-12-10').build());

    const [message] = fixture.dispatcher.dispatched;
    expect(message!.notificationType).toBe(NotificationTemplateKey.CHARGE_ISSUED_PERIOD);
    expect(nbsp(message!.subject)).toBe(
      'Cobrança da assinatura de Clínica <Sol>: R$ 49,00, vencimento em 10/12/2026',
    );
    expect(message!.body).toContain('href="https://pay.example.test/charge-1"');
    expect(message!.body).toContain('Se você já pagou, desconsidere este aviso.');
  });

  it('picks the recovery wording for a RECOVERY charge, which also carries the tolerant sentence', async () => {
    await useCase.execute(dto().withKind('RECOVERY').build());

    const [message] = fixture.dispatcher.dispatched;
    expect(message!.notificationType).toBe(NotificationTemplateKey.CHARGE_ISSUED_RECOVERY);
    expect(nbsp(message!.subject)).toContain('para reativar a assinatura');
    expect(message!.body).toContain('Se você já pagou, desconsidere este aviso.');
  });

  it('escapes the payment link', async () => {
    await useCase.execute(dto().withPaymentUrl('https://pay.example.test/c?a=1&b="2"').build());

    expect(fixture.dispatcher.dispatched[0]!.body).toContain('c?a=1&amp;b=&quot;2&quot;');
  });

  it.each(['PERIOD', 'RECOVERY'] as const)(
    'a %s invoice carries the English tolerant sentence for an English tenant',
    async (kind) => {
      fixture.setTenant(BILLING_FIXTURE_TENANT_ID, 'en');

      await useCase.execute(dto().withKind(kind).build());

      expect(fixture.dispatcher.dispatched[0]!.body).toContain(
        'If you have already paid, please disregard this notice.',
      );
    },
  );
});
