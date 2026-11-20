import { countrySpec } from '@ikaro/i18n';
import { Address } from '../../../shared/value-objects/address';
import { BillingAccountBuilder } from '../../../test/builders/billing';

const address = (): Address =>
  Address.create(
    {
      street: 'Rua das Flores',
      number: '100',
      neighborhood: 'Centro',
      city: 'Belo Horizonte',
      state: 'MG',
      zipCode: '30130-110',
    },
    countrySpec('BR').address,
  );

describe('BillingAccount.hasBillableIdentity (UC-113 A8 / A9)', () => {
  it('is true with a tax id and a full address', () => {
    const account = new BillingAccountBuilder()
      .withTaxId('11144477735', 'CPF')
      .withAddress(address())
      .build();

    expect(account.hasBillableIdentity()).toBe(true);
  });

  it('A8: is false without the tax id Brazil requires', () => {
    const account = new BillingAccountBuilder().withAddress(address()).build();

    expect(account.hasBillableIdentity()).toBe(false);
  });

  it('A9: is false without a billing address', () => {
    const account = new BillingAccountBuilder().withTaxId('11144477735', 'CPF').build();

    expect(account.hasBillableIdentity()).toBe(false);
  });
});

describe('BillingAccount.assignProviderCustomer', () => {
  it('records the first provider customer', () => {
    const account = new BillingAccountBuilder().build();

    expect(account.assignProviderCustomer('ASAAS', 'cus_1')).toBe(true);
    expect(account.provider).toBe('ASAAS');
    expect(account.providerCustomerId).toBe('cus_1');
  });

  it('keeps the first one for good: a different customer never repoints the account', () => {
    const account = new BillingAccountBuilder().withProvider('ASAAS', 'cus_1').build();

    expect(account.assignProviderCustomer('ASAAS', 'cus_2')).toBe(false);
    expect(account.providerCustomerId).toBe('cus_1');
  });
});
