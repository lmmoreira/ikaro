import { BillingAccountBuilder } from '../../../../test/builders/billing';
import { AddressBuilder } from '../../../../test/builders/shared';
import { toBillingIdentityResponse } from './billing-identity.helper';

describe('toBillingIdentityResponse', () => {
  it('maps an account with nothing saved to nulls', () => {
    expect(toBillingIdentityResponse(new BillingAccountBuilder().build())).toEqual({
      provisioning: false,
      taxIdType: null,
      taxId: null,
      legalName: null,
      billingEmail: null,
      address: null,
    });
  });

  it('maps the tax id as its normalised value and type, the email as its address', () => {
    const account = new BillingAccountBuilder()
      .withTaxId('11222333000181', 'CNPJ')
      .withLegalName('Acme Ltda')
      .withBillingEmail('billing@acme.test')
      .build();

    expect(toBillingIdentityResponse(account)).toMatchObject({
      taxIdType: 'CNPJ',
      taxId: '11222333000181',
      legalName: 'Acme Ltda',
      billingEmail: 'billing@acme.test',
    });
  });

  it('maps a stored address with its optional parts as null, never undefined', () => {
    const account = new BillingAccountBuilder().withAddress(new AddressBuilder().build()).build();

    expect(toBillingIdentityResponse(account).address).toEqual({
      street: 'Rua das Flores',
      number: '100',
      complement: null,
      neighborhood: 'Centro',
      city: 'Belo Horizonte',
      state: 'MG',
      zipCode: '30130-110',
    });
  });
});
