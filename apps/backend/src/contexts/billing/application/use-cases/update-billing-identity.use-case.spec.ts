import { countrySpec } from '@ikaro/i18n';
import { BillingErrorCode } from '@ikaro/types/protocol/errors';
import { BILLING_TAX_ID_TYPES } from '@ikaro/validation';
import { BillingAccountBuilder } from '../../../../test/builders/billing';
import { AddressBuilder } from '../../../../test/builders/shared';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBillingAccountRepository } from '../../../../test/repositories/billing/in-memory-billing-account.repository';
import { AddressValidationError } from '../../../../shared/value-objects/address';
import {
  BillingIdentityEmailInvalidError,
  BillingIdentityTaxIdInvalidError,
  BillingProvisioningError,
} from '../../domain/errors/billing-domain.error';
import { UpdateBillingIdentityUseCase } from './update-billing-identity.use-case';

const TENANT_ID = '0197b0a0-0000-7000-8000-0000000000a1';
const CPF = '52998224725';

describe('UpdateBillingIdentityUseCase (UC-118)', () => {
  let accounts: InMemoryBillingAccountRepository;
  let txManager: InMemoryTransactionManager;
  let useCase: UpdateBillingIdentityUseCase;

  beforeEach(() => {
    accounts = new InMemoryBillingAccountRepository();
    txManager = new InMemoryTransactionManager();
    useCase = new UpdateBillingIdentityUseCase(accounts, txManager);
  });

  const seed = async (builder = new BillingAccountBuilder()) => {
    const account = builder.withTenantId(TENANT_ID).build();
    await accounts.save(account);
    return account;
  };

  it('saves the sent fields inside one transaction and answers the stored identity', async () => {
    await seed();

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      taxId: '529.982.247-25',
      legalName: 'Acme Ltda',
      billingEmail: 'Billing@Acme.test',
      address: {
        street: 'Rua A',
        number: '1',
        neighborhood: 'Centro',
        city: 'Belo Horizonte',
        state: 'MG',
        zipCode: '30130-110',
      },
    });

    expect(txManager.runCallCount).toBe(1);
    expect(result).toEqual({
      provisioning: false,
      taxIdType: 'CPF',
      taxId: CPF,
      legalName: 'Acme Ltda',
      billingEmail: 'billing@acme.test',
      address: {
        street: 'Rua A',
        number: '1',
        complement: null,
        neighborhood: 'Centro',
        city: 'Belo Horizonte',
        state: 'MG',
        zipCode: '30130-110',
      },
    });
    const stored = await accounts.findByTenantId(TENANT_ID);
    expect(stored?.hasBillableIdentity()).toBe(true);
  });

  it('leaves the fields it is not sent as they are', async () => {
    await seed(new BillingAccountBuilder().withTaxId(CPF, 'CPF').withLegalName('Acme Ltda'));

    const result = await useCase.execute({ tenantId: TENANT_ID, billingEmail: 'a@b.test' });

    expect(result).toMatchObject({ taxId: CPF, legalName: 'Acme Ltda', billingEmail: 'a@b.test' });
  });

  it('is the provisioning refusal when the tenant has no billing account yet', async () => {
    await expect(useCase.execute({ tenantId: TENANT_ID, legalName: 'x' })).rejects.toBeInstanceOf(
      BillingProvisioningError,
    );
  });

  it('never touches another tenant’s account', async () => {
    const other = new BillingAccountBuilder().build();
    await accounts.save(other);

    await expect(useCase.execute({ tenantId: TENANT_ID, legalName: 'x' })).rejects.toBeInstanceOf(
      BillingProvisioningError,
    );
    expect(other.legalName).toBeNull();
  });

  describe('the shared value-object errors become Billing errors', () => {
    it('an invalid tax id is BILLING_IDENTITY_TAX_ID_INVALID, and the stored id is kept', async () => {
      const account = await seed(new BillingAccountBuilder().withTaxId(CPF, 'CPF'));

      const err = await useCase.execute({ tenantId: TENANT_ID, taxId: '123' }).catch((e) => e);

      expect(err).toBeInstanceOf(BillingIdentityTaxIdInvalidError);
      expect(err.code).toBe(BillingErrorCode.IDENTITY_TAX_ID_INVALID);
      expect(account.taxId?.value).toBe(CPF);
    });

    it.each([
      ['null', null],
      ['an empty string', ''],
    ])(
      'clearing a BR tax id with %s is the same error: it is never blankable',
      async (_l, taxId) => {
        const account = await seed(new BillingAccountBuilder().withTaxId(CPF, 'CPF'));

        await expect(useCase.execute({ tenantId: TENANT_ID, taxId })).rejects.toBeInstanceOf(
          BillingIdentityTaxIdInvalidError,
        );
        expect(account.taxId?.value).toBe(CPF);
      },
    );

    it('an invalid email is BILLING_IDENTITY_EMAIL_INVALID', async () => {
      await seed();

      const err = await useCase
        .execute({ tenantId: TENANT_ID, billingEmail: 'nope' })
        .catch((e) => e);

      expect(err).toBeInstanceOf(BillingIdentityEmailInvalidError);
      expect(err.code).toBe(BillingErrorCode.IDENTITY_EMAIL_INVALID);
    });

    it('an address error is passed through untouched, for the shared mapper', async () => {
      await seed(new BillingAccountBuilder().withAddress(new AddressBuilder().build()));

      await expect(
        useCase.execute({ tenantId: TENANT_ID, address: { zipCode: '30140-07' } }),
      ).rejects.toBeInstanceOf(AddressValidationError);
    });
  });

  it('the tax id types the schema accepts are every type some country spec accepts', () => {
    const accepted = new Set<string>(
      ['BR', 'US', 'ZZ'].flatMap((code) => countrySpec(code).taxId.types),
    );

    expect([...BILLING_TAX_ID_TYPES].sort()).toEqual([...accepted].sort());
  });
});
