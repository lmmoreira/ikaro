import { AddressErrorCode, SignupErrorCode } from '@ikaro/types/protocol/errors';
import { BillingAccountBuilder } from '../../../test/builders/billing';
import { AddressBuilder } from '../../../test/builders/shared';
import { AddressValidationError } from '../../../shared/value-objects/address';
import { EmailValidationError } from '../../../shared/value-objects/email.vo';
import { TaxIdValidationError } from '../../../shared/value-objects/tax-id.vo';

const CPF = '52998224725';
const OTHER_CPF = '11144477735';
const US_ADDRESS = {
  street: 'Main St',
  number: '10',
  city: 'Austin',
  state: 'TX',
  zipCode: '73301',
};

function failure(work: () => void): unknown {
  try {
    work();
  } catch (err) {
    return err;
  }
  throw new Error('expected the call to throw');
}

describe('BillingAccount.updateIdentity (UC-118)', () => {
  describe('the tax id', () => {
    it('leaves every field it is not sent untouched', () => {
      const account = new BillingAccountBuilder()
        .withTaxId(CPF, 'CPF')
        .withLegalName('Acme Ltda')
        .withBillingEmail('billing@acme.test')
        .withAddress(new AddressBuilder().build())
        .build();

      account.updateIdentity({ legalName: 'Acme Serviços Ltda' });

      expect(account.taxId?.value).toBe(CPF);
      expect(account.billingEmail?.address).toBe('billing@acme.test');
      expect(account.address?.street).toBe('Rua das Flores');
      expect(account.legalName).toBe('Acme Serviços Ltda');
    });

    it('replaces an existing BR id, inferring CPF versus CNPJ by shape and normalising it', () => {
      const account = new BillingAccountBuilder().withTaxId(CPF, 'CPF').build();

      account.updateIdentity({ taxId: '11.222.333/0001-81' });

      expect(account.taxId?.type).toBe('CNPJ');
      expect(account.taxId?.value).toBe('11222333000181');
    });

    it('accepts an alphanumeric CNPJ with valid check digits, as typed with punctuation', () => {
      const account = new BillingAccountBuilder().build();

      account.updateIdentity({ taxId: '12.abc.345/01de-35', taxIdType: 'CNPJ' });

      expect(account.taxId?.value).toBe('12ABC34501DE35');
    });

    it('supplies a missing id on an account that has none (an operator tenant, an exempt shell)', () => {
      const account = new BillingAccountBuilder().build();

      account.updateIdentity({ taxId: OTHER_CPF });

      expect(account.taxId?.value).toBe(OTHER_CPF);
    });

    it.each([
      ['a bad check digit', '11222333000182'],
      ['a bad check digit on an alphanumeric id', '12ABC34501DE36'],
      ['a value that is neither a CPF nor a CNPJ', '123'],
    ])('rejects %s and keeps the stored id', (_label, taxId) => {
      const account = new BillingAccountBuilder().withTaxId(CPF, 'CPF').build();

      const err = failure(() => account.updateIdentity({ taxId }));

      expect(err).toBeInstanceOf(TaxIdValidationError);
      expect((err as TaxIdValidationError).code).toBe(SignupErrorCode.TAX_ID_INVALID);
      expect(account.taxId?.value).toBe(CPF);
    });

    it('checks a declared type only: a CPF declared as a CNPJ is invalid', () => {
      const account = new BillingAccountBuilder().build();

      const err = failure(() => account.updateIdentity({ taxId: CPF, taxIdType: 'CNPJ' }));

      expect(err).toBeInstanceOf(TaxIdValidationError);
    });

    it.each([
      ['null', null],
      ['a blank string', '  '],
    ])('never clears a BR id: %s is refused and the stored id kept', (_label, taxId) => {
      const account = new BillingAccountBuilder().withTaxId(CPF, 'CPF').build();

      const err = failure(() => account.updateIdentity({ taxId }));

      expect((err as TaxIdValidationError).code).toBe(SignupErrorCode.TAX_ID_REQUIRED);
      expect(account.taxId?.value).toBe(CPF);
    });

    it('clearing an id the BR account never had changes nothing (an exempt shell is not refused)', () => {
      const account = new BillingAccountBuilder().build();

      account.updateIdentity({ taxId: null });

      expect(account.taxId).toBeNull();
    });

    describe('for a US account, where the id is optional', () => {
      it('takes an EIN without a declared type', () => {
        const account = new BillingAccountBuilder().withCountryCode('US').build();

        account.updateIdentity({ taxId: '12-3456789' });

        expect(account.taxId?.type).toBe('EIN');
        expect(account.taxId?.value).toBe('123456789');
      });

      it('takes another document declared as OTHER, up to 32 characters', () => {
        const account = new BillingAccountBuilder().withCountryCode('US').build();

        account.updateIdentity({ taxId: 'ITIN 900-70-0000', taxIdType: 'OTHER' });

        expect(account.taxId?.type).toBe('OTHER');
        expect(account.taxId?.value).toBe('ITIN 900-70-0000');
      });

      it('refuses a declared OTHER over 32 characters and an EIN that is not 9 digits', () => {
        const account = new BillingAccountBuilder().withCountryCode('US').build();

        expect(() => account.updateIdentity({ taxId: 'x'.repeat(33), taxIdType: 'OTHER' })).toThrow(
          TaxIdValidationError,
        );
        expect(() => account.updateIdentity({ taxId: '1234' })).toThrow(TaxIdValidationError);
      });

      it('clears the id, and its type with it', () => {
        const account = new BillingAccountBuilder()
          .withCountryCode('US')
          .withTaxId('123456789', 'EIN')
          .build();

        account.updateIdentity({ taxId: null });

        expect(account.taxId).toBeNull();
      });

      it('offers no CNPJ or CPF: a BR type declared for a US account is refused', () => {
        const account = new BillingAccountBuilder().withCountryCode('US').build();

        expect(() => account.updateIdentity({ taxId: CPF, taxIdType: 'CPF' })).toThrow(
          TaxIdValidationError,
        );
      });
    });
  });

  describe('the legal name and the billing email', () => {
    it('stores a trimmed name and a lower-cased email', () => {
      const account = new BillingAccountBuilder().build();

      account.updateIdentity({ legalName: '  Acme Ltda ', billingEmail: ' Billing@Acme.TEST ' });

      expect(account.legalName).toBe('Acme Ltda');
      expect(account.billingEmail?.address).toBe('billing@acme.test');
    });

    it.each([
      ['null', null],
      ['a blank string', ''],
    ])('clears both with %s', (_label, value) => {
      const account = new BillingAccountBuilder()
        .withLegalName('Acme Ltda')
        .withBillingEmail('billing@acme.test')
        .build();

      account.updateIdentity({ legalName: value, billingEmail: value });

      expect(account.legalName).toBeNull();
      expect(account.billingEmail).toBeNull();
    });

    it('refuses an invalid email and keeps the stored one', () => {
      const account = new BillingAccountBuilder().withBillingEmail('billing@acme.test').build();

      expect(() => account.updateIdentity({ billingEmail: 'not-an-email' })).toThrow(
        EmailValidationError,
      );
      expect(account.billingEmail?.address).toBe('billing@acme.test');
    });
  });

  describe('the address (merged over the stored one, validated whole)', () => {
    it('stores a complete address on an account that has none', () => {
      const account = new BillingAccountBuilder().build();

      account.updateIdentity({
        address: {
          street: 'Rua A',
          number: '1',
          neighborhood: 'Centro',
          city: 'Belo Horizonte',
          state: 'MG',
          zipCode: '30130-110',
        },
      });

      expect(account.address?.toJSON()).toEqual({
        street: 'Rua A',
        number: '1',
        complement: undefined,
        neighborhood: 'Centro',
        city: 'Belo Horizonte',
        state: 'MG',
        zipCode: '30130-110',
      });
    });

    it('changes only the sent sub-fields of a stored address', () => {
      const account = new BillingAccountBuilder().withAddress(new AddressBuilder().build()).build();

      account.updateIdentity({ address: { city: 'Contagem', zipCode: '32010-000' } });

      expect(account.address?.city).toBe('Contagem');
      expect(account.address?.zipCode).toBe('32010-000');
      expect(account.address?.street).toBe('Rua das Flores');
      expect(account.address?.neighborhood).toBe('Centro');
    });

    it('clears the complement with null, and refuses clearing a neighbourhood Brazil requires', () => {
      const account = new BillingAccountBuilder().withAddress(new AddressBuilder().build()).build();
      account.updateIdentity({ address: { complement: 'Apto 2' } });
      expect(account.address?.complement).toBe('Apto 2');

      account.updateIdentity({ address: { complement: null } });
      const err = failure(() => account.updateIdentity({ address: { neighborhood: null } }));

      expect(account.address?.complement).toBeUndefined();
      expect((err as AddressValidationError).code).toBe(AddressErrorCode.NEIGHBORHOOD_REQUIRED);
      expect(account.address?.neighborhood).toBe('Centro');
    });

    it('stores nothing for an incomplete merge, and applies none of the other sent fields', () => {
      const account = new BillingAccountBuilder().withLegalName('Acme Ltda').build();

      const err = failure(() =>
        account.updateIdentity({ legalName: 'New Name', address: { city: 'Belo Horizonte' } }),
      );

      expect(err).toBeInstanceOf(AddressValidationError);
      expect((err as AddressValidationError).code).toBe(AddressErrorCode.FIELD_REQUIRED);
      expect(account.address).toBeNull();
      expect(account.legalName).toBe('Acme Ltda');
    });

    it('refuses a postal code or a state in the wrong format for the billing country', () => {
      const account = new BillingAccountBuilder().withAddress(new AddressBuilder().build()).build();

      const postal = failure(() => account.updateIdentity({ address: { zipCode: '30140-07' } }));
      const state = failure(() => account.updateIdentity({ address: { state: 'M1' } }));

      expect((postal as AddressValidationError).code).toBe(AddressErrorCode.POSTAL_CODE_INVALID);
      expect((state as AddressValidationError).code).toBe(AddressErrorCode.STATE_INVALID);
      expect(account.address?.zipCode).toBe('30130-110');
    });

    it('validates a US address by the US field set: no neighbourhood, a 5-digit ZIP', () => {
      const account = new BillingAccountBuilder().withCountryCode('US').build();

      account.updateIdentity({ address: US_ADDRESS });

      expect(account.address?.zipCode).toBe('73301');
      expect(() => account.updateIdentity({ address: { zipCode: '3130-110' } })).toThrow(
        AddressValidationError,
      );
    });
  });

  it('makes a complete BR identity billable (the held-subscription release rule)', () => {
    const account = new BillingAccountBuilder().build();
    expect(account.hasBillableIdentity()).toBe(false);

    account.updateIdentity({
      taxId: CPF,
      address: {
        street: 'Rua A',
        number: '1',
        neighborhood: 'Centro',
        city: 'BH',
        state: 'MG',
        zipCode: '30130-110',
      },
    });

    expect(account.hasBillableIdentity()).toBe(true);
  });
});
