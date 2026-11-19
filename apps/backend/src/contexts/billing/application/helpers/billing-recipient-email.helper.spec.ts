import { BillingAccountBuilder } from '../../../../test/builders/billing';
import { resolveBillingRecipientEmail } from './billing-recipient-email.helper';

describe('resolveBillingRecipientEmail', () => {
  it('returns the billing email when set', () => {
    const account = new BillingAccountBuilder().withBillingEmail('billing@example.test').build();

    expect(resolveBillingRecipientEmail(false, account)).toBe('billing@example.test');
  });

  it('returns null when the account has no billing email', () => {
    expect(resolveBillingRecipientEmail(false, new BillingAccountBuilder().build())).toBeNull();
  });

  it('returns null when the tenant has no account', () => {
    expect(resolveBillingRecipientEmail(false, null)).toBeNull();
  });

  it('returns null for an exempt subscription, whatever the account holds', () => {
    const account = new BillingAccountBuilder().withBillingEmail('billing@example.test').build();

    expect(resolveBillingRecipientEmail(true, account)).toBeNull();
  });
});
