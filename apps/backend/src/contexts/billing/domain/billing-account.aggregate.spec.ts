import { SignupErrorCode } from '@ikaro/types/protocol/errors';
import { CountryCode } from '../../../shared/value-objects/country-code.vo';
import { Email } from '../../../shared/value-objects/email.vo';
import { TaxId, TaxIdValidationError } from '../../../shared/value-objects/tax-id.vo';
import { BillingAccountBuilder } from '../../../test/builders/billing';
import { BillingAccount, type CreateBillingAccountInput } from './billing-account.aggregate';
import { BillingAccountTaxIdNotAllowedError } from './errors/billing-domain.error';

const CPF = '529.982.247-25';
const CNPJ = '11.222.333/0001-81';

function input(overrides: Partial<CreateBillingAccountInput> = {}): CreateBillingAccountInput {
  return {
    tenantId: '0197a2b0-0000-7000-8000-000000000001',
    countryCode: CountryCode.create('BR'),
    taxId: { raw: CPF },
    requireTaxId: true,
    ...overrides,
  };
}

function taxIdCode(fn: () => void): string | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof TaxIdValidationError ? err.code : undefined;
  }
  return undefined;
}

describe('BillingAccount', () => {
  describe('create — a tax id always belongs to the account country', () => {
    it('builds a BR CPF or CNPJ from raw input and normalises it', () => {
      const cpf = BillingAccount.create(input({ taxId: { raw: CPF } }));
      const cnpj = BillingAccount.create(input({ taxId: { raw: CNPJ } }));

      expect(cpf.taxId?.type).toBe('CPF');
      expect(cpf.taxId?.value).toBe('52998224725');
      expect(cnpj.taxId?.type).toBe('CNPJ');
      expect(cnpj.taxId?.value).toBe('11222333000181');
    });

    it('builds a US EIN, or an OTHER document the user declares', () => {
      const us = CountryCode.create('US');

      const ein = BillingAccount.create(input({ countryCode: us, taxId: { raw: '12-3456789' } }));
      const other = BillingAccount.create(
        input({ countryCode: us, taxId: { raw: 'SSN-ish free text', declaredType: 'OTHER' } }),
      );

      expect(ein.taxId?.type).toBe('EIN');
      expect(other.taxId?.type).toBe('OTHER');
    });

    it('refuses an invalid BR tax id through TaxId', () => {
      expect(taxIdCode(() => BillingAccount.create(input({ taxId: { raw: '52998224726' } })))).toBe(
        SignupErrorCode.TAX_ID_INVALID,
      );
    });

    it('refuses a BR account with no tax id where one is required (SIGNUP_TAX_ID_REQUIRED)', () => {
      for (const taxId of [null, { raw: null }, { raw: '   ' }]) {
        expect(taxIdCode(() => BillingAccount.create(input({ taxId })))).toBe(
          SignupErrorCode.TAX_ID_REQUIRED,
        );
      }
    });

    it('lets a US account hold no tax id at all', () => {
      const account = BillingAccount.create(
        input({ countryCode: CountryCode.create('US'), taxId: null }),
      );

      expect(account.taxId).toBeNull();
    });

    it('lets an exempt BR tenant (requireTaxId = false) hold no tax id, but still validates one it is given', () => {
      expect(BillingAccount.create(input({ taxId: null, requireTaxId: false })).taxId).toBeNull();
      expect(
        BillingAccount.create(input({ taxId: { raw: '' }, requireTaxId: false })).taxId,
      ).toBeNull();
      expect(
        taxIdCode(() =>
          BillingAccount.create(input({ taxId: { raw: 'nope' }, requireTaxId: false })),
        ),
      ).toBe(SignupErrorCode.TAX_ID_INVALID);
    });

    it('refuses a ready-made TaxId whose type the country does not accept', () => {
      const br = CountryCode.create('BR');
      const us = CountryCode.create('US');

      for (const [country, taxId] of [
        [br, TaxId.reconstitute('123456789', 'EIN')],
        [br, TaxId.reconstitute('whatever', 'OTHER')],
        [us, TaxId.reconstitute('52998224725', 'CPF')],
        [us, TaxId.reconstitute('11222333000181', 'CNPJ')],
      ] as const) {
        expect(() => BillingAccount.create(input({ countryCode: country, taxId }))).toThrow(
          BillingAccountTaxIdNotAllowedError,
        );
      }
    });

    it('accepts a ready-made TaxId of an accepted type (copied from a registration)', () => {
      const taxId = TaxId.reconstitute('52998224725', 'CPF');

      expect(BillingAccount.create(input({ taxId })).taxId).toBe(taxId);
    });

    it('starts with no provider customer, auto-billing off and the given terms and identity', () => {
      const acceptedTerms = {
        version: '2026-11',
        acceptedAt: new Date('2026-11-10T12:00:00Z'),
        acceptedBy: 'gerente@example.com',
      };

      const account = BillingAccount.create(
        input({
          legalName: 'Lava Rápido Ltda',
          billingEmail: Email.create('financeiro@example.com'),
          acceptedTerms,
        }),
      );

      expect(account.provider).toBeNull();
      expect(account.providerCustomerId).toBeNull();
      expect(account.autoBilling).toBe('NONE');
      expect(account.autoBillingStatus).toBe('INACTIVE');
      expect(account.address).toBeNull();
      expect(account.legalName).toBe('Lava Rápido Ltda');
      expect(account.billingEmail?.address).toBe('financeiro@example.com');
      expect(account.acceptedTerms).toEqual(acceptedTerms);
      expect(account.countryCode.value).toBe('BR');
      expect(account.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('reconstitute', () => {
    it('never validates: a BR shell with no tax id (exempt tenant, S05 backfill) loads', () => {
      expect(() => new BillingAccountBuilder().withCountryCode('BR').build()).not.toThrow();
      expect(new BillingAccountBuilder().withCountryCode('BR').build().taxId).toBeNull();
    });

    it('does not re-check the country of a stored tax id', () => {
      const account = new BillingAccountBuilder()
        .withCountryCode('US')
        .withTaxId('52998224725', 'CPF')
        .build();

      expect(account.taxId?.type).toBe('CPF');
    });
  });
});
