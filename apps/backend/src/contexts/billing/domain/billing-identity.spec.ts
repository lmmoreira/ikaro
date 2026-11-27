import { CountryCode } from '../../../shared/value-objects/country-code.vo';
import { Email } from '../../../shared/value-objects/email.vo';
import { TaxId } from '../../../shared/value-objects/tax-id.vo';
import { AddressBuilder } from '../../../test/builders/shared';
import { applyBillingIdentityPatch, type BillingIdentity } from './billing-identity';

const BR = CountryCode.create('BR');
const US = CountryCode.create('US');

const EMPTY: BillingIdentity = { taxId: null, legalName: null, billingEmail: null, address: null };

const FULL: BillingIdentity = {
  taxId: TaxId.reconstitute('52998224725', 'CPF'),
  legalName: 'Acme Ltda',
  billingEmail: Email.reconstitute('billing@acme.test'),
  address: new AddressBuilder().build(),
};

describe('applyBillingIdentityPatch', () => {
  it('returns every field as it was for an empty patch, without touching the input', () => {
    const next = applyBillingIdentityPatch(FULL, {}, BR);

    expect(next).toEqual(FULL);
    expect(next).not.toBe(FULL);
  });

  it('resolves every sent field at once', () => {
    const next = applyBillingIdentityPatch(
      EMPTY,
      {
        taxId: '11.222.333/0001-81',
        legalName: '  Acme  ',
        billingEmail: 'A@B.test',
        address: { ...new AddressBuilder().build().toJSON(), complement: 'Sala 3' },
      },
      BR,
    );

    expect(next.taxId?.value).toBe('11222333000181');
    expect(next.legalName).toBe('Acme');
    expect(next.billingEmail?.address).toBe('a@b.test');
    expect(next.address?.complement).toBe('Sala 3');
  });

  it('reads the tax id rule from the country: a blank clears for the US, never for BR', () => {
    const us = { ...FULL, taxId: TaxId.reconstitute('123456789', 'EIN') };

    expect(applyBillingIdentityPatch(us, { taxId: ' ' }, US).taxId).toBeNull();
    expect(() => applyBillingIdentityPatch(FULL, { taxId: ' ' }, BR)).toThrow();
  });

  it('throws without a partial result: a late failure leaves the earlier fields unapplied', () => {
    expect(() =>
      applyBillingIdentityPatch(FULL, { legalName: 'New', billingEmail: 'nope' }, BR),
    ).toThrow();
    expect(FULL.legalName).toBe('Acme Ltda');
  });
});
