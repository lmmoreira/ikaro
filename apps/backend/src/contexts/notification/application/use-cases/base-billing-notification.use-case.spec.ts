import { SendChargePaidNotificationDtoBuilder } from '../../../../test/builders/notification';
import {
  BILLING_FIXTURE_FRONTEND_URL,
  BILLING_FIXTURE_OTHER_TENANT_ID,
  BILLING_FIXTURE_TENANT_ID,
  BillingNotificationFixture,
} from '../../../../test/utils/billing-notification-fixture';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { PlatformTemplateNotFoundError } from '../../domain/errors/platform-template-not-found.error';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { requireBillingField } from './base-billing-notification.use-case';
import { SendChargePaidNotificationUseCase } from './send-charge-paid-notification/send-charge-paid-notification.use-case';
import { SendSubscriptionPastDueNotificationUseCase } from './send-subscription-past-due-notification/send-subscription-past-due-notification.use-case';

const nbsp = (text: string): string => text.replace(/ /g, ' ');

// The behaviour every Billing email shares (UC-124), shown through two of the nine use cases.
describe('BaseBillingNotificationUseCase', () => {
  let fixture: BillingNotificationFixture;

  const dto = (): SendChargePaidNotificationDtoBuilder =>
    new SendChargePaidNotificationDtoBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
  });

  it('sends only to the event recipientEmail when it is set, not to the managers', async () => {
    const result = await fixture
      .build(SendChargePaidNotificationUseCase)
      .execute(dto().withRecipientEmail('cobranca@example.com').build());

    expect(result).toEqual({ emailSent: true });
    expect(fixture.dispatcher.dispatched.map((m) => m.to)).toEqual(['cobranca@example.com']);
  });

  it('falls back to every manager when the event has no recipientEmail', async () => {
    await fixture
      .build(SendChargePaidNotificationUseCase)
      .execute(dto().withRecipientEmail(null).build());

    expect(fixture.dispatcher.dispatched.map((m) => m.to).sort()).toEqual([
      'ana@example.com',
      'bruno@example.com',
    ]);
  });

  it('writes the platform copy in the tenant locale, with money, dates and the tenant name formatted and escaped', async () => {
    await fixture.build(SendChargePaidNotificationUseCase).execute(dto().build());

    const [message] = fixture.dispatcher.dispatched;
    expect(nbsp(message!.subject)).toBe('Recebemos o pagamento de R$ 49,00');
    expect(message!.body).toContain('09/12/2026');
    expect(message!.body).toContain('Clínica &lt;Sol&gt;');
    expect(message!.channel).toBe('EMAIL');
  });

  it('writes the English copy for an English tenant', async () => {
    fixture.setTenant(BILLING_FIXTURE_TENANT_ID, 'en');

    await fixture.build(SendChargePaidNotificationUseCase).execute(dto().build());

    expect(fixture.dispatcher.dispatched[0]!.subject).toBe('We received your payment of R$49.00');
    expect(fixture.dispatcher.dispatched[0]!.body).toContain('12/09/2026');
  });

  it('links the billing page under FRONTEND_URL', async () => {
    await fixture.build(SendSubscriptionPastDueNotificationUseCase).execute({
      tenantId: BILLING_FIXTURE_TENANT_ID,
      eventId: 'eeeeeeee-0000-4000-8000-000000002610',
      correlationId: 'corr-1',
      suspendsAt: '2026-12-20T15:00:00.000Z',
      recipientEmail: 'cobranca@example.com',
    });

    expect(fixture.dispatcher.dispatched[0]!.body).toContain(
      `href="${BILLING_FIXTURE_FRONTEND_URL}/dashboard/billing"`,
    );
  });

  it('writes one SENT log row carrying the event tenantId', async () => {
    await fixture.build(SendChargePaidNotificationUseCase).execute(dto().build());

    expect(fixture.logRepo.all).toHaveLength(1);
    expect(fixture.logRepo.all.every((log) => log.tenantId === BILLING_FIXTURE_TENANT_ID)).toBe(
      true,
    );
    expect(fixture.logRepo.all.every((log) => log.status === 'SENT')).toBe(true);
  });

  it('sends nothing the second time the same eventId is delivered', async () => {
    const useCase = fixture.build(SendChargePaidNotificationUseCase);

    await useCase.execute(dto().build());
    fixture.dispatcher.clear();
    await useCase.execute(dto().build());

    expect(fixture.dispatcher.dispatched).toEqual([]);
    expect(fixture.logRepo.all).toHaveLength(1);
  });

  it('emails only the event tenant managers, never another tenant', async () => {
    fixture.staffPort.setManagerEmails(BILLING_FIXTURE_OTHER_TENANT_ID, ['other@example.com']);

    await fixture
      .build(SendChargePaidNotificationUseCase)
      .execute(dto().withRecipientEmail(null).build());

    expect(fixture.dispatcher.dispatched.map((m) => m.to)).not.toContain('other@example.com');
    expect(
      fixture.dispatcher.dispatched.every((m) => m.tenantId === BILLING_FIXTURE_TENANT_ID),
    ).toBe(true);
  });

  it('sends nothing, and says so, when there is neither a billing email nor a manager', async () => {
    fixture.staffPort.setManagerEmails(BILLING_FIXTURE_TENANT_ID, []);

    const result = await fixture
      .build(SendChargePaidNotificationUseCase)
      .execute(dto().withRecipientEmail(null).build());

    expect(result).toEqual({ emailSent: false });
    expect(fixture.dispatcher.dispatched).toEqual([]);
  });

  it('throws, and sends nothing, when the tenant cannot be read', async () => {
    await expect(
      fixture
        .build(SendChargePaidNotificationUseCase)
        .execute(dto().withTenantId(BILLING_FIXTURE_OTHER_TENANT_ID).build()),
    ).rejects.toThrow('not found for a Billing email');

    expect(fixture.dispatcher.dispatched).toEqual([]);
  });

  it('logs billing_template_missing and rethrows when the platform template is missing', async () => {
    const error = jest.spyOn(AppLogger.prototype, 'error').mockImplementation();
    const empty = new BillingNotificationFixture('pt-BR', false);

    await expect(
      empty.build(SendChargePaidNotificationUseCase).execute(dto().build()),
    ).rejects.toBeInstanceOf(PlatformTemplateNotFoundError);

    expect(error).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        event: 'billing_template_missing',
        tenantId: BILLING_FIXTURE_TENANT_ID,
        triggerEvent: NotificationTemplateKey.CHARGE_PAID,
        locale: 'pt-BR',
      }),
    );
    expect(empty.dispatcher.dispatched).toEqual([]);
    error.mockRestore();
  });

  describe('requireBillingField', () => {
    it('returns a present value, including a falsy one', () => {
      expect(requireBillingField(0, 'amountMinor')).toBe(0);
    });

    it.each([null, undefined])('throws naming the field when it is %s', (value) => {
      expect(() => requireBillingField(value, 'dueDate')).toThrow('"dueDate"');
    });
  });
});
