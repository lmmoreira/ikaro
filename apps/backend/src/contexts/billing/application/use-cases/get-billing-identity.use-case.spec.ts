import { BillingAccountBuilder } from '../../../../test/builders/billing';
import { AddressBuilder } from '../../../../test/builders/shared';
import { InMemoryBillingAccountRepository } from '../../../../test/repositories/billing/in-memory-billing-account.repository';
import { GetBillingIdentityUseCase } from './get-billing-identity.use-case';

const TENANT_ID = '0197b0a0-0000-7000-8000-0000000000a1';
const OTHER_TENANT_ID = '0197b0a0-0000-7000-8000-0000000000b2';

describe('GetBillingIdentityUseCase (UC-118)', () => {
  let accounts: InMemoryBillingAccountRepository;
  let useCase: GetBillingIdentityUseCase;

  beforeEach(() => {
    accounts = new InMemoryBillingAccountRepository();
    useCase = new GetBillingIdentityUseCase(accounts);
  });

  it('is the provisioning answer when the tenant has no billing account yet', async () => {
    await expect(useCase.execute({ tenantId: TENANT_ID })).resolves.toEqual({ provisioning: true });
  });

  it('answers an empty identity as nulls', async () => {
    await accounts.save(new BillingAccountBuilder().withTenantId(TENANT_ID).build());

    await expect(useCase.execute({ tenantId: TENANT_ID })).resolves.toEqual({
      provisioning: false,
      taxIdType: null,
      taxId: null,
      legalName: null,
      billingEmail: null,
      address: null,
    });
  });

  it('answers the caller’s own identity, never another tenant’s', async () => {
    await accounts.save(
      new BillingAccountBuilder()
        .withTenantId(TENANT_ID)
        .withTaxId('52998224725', 'CPF')
        .withLegalName('Acme Ltda')
        .withBillingEmail('billing@acme.test')
        .withAddress(new AddressBuilder().build())
        .build(),
    );
    await accounts.save(
      new BillingAccountBuilder().withTenantId(OTHER_TENANT_ID).withLegalName('Other').build(),
    );

    const identity = await useCase.execute({ tenantId: TENANT_ID });

    expect(identity).toMatchObject({
      provisioning: false,
      taxIdType: 'CPF',
      taxId: '52998224725',
      legalName: 'Acme Ltda',
      billingEmail: 'billing@acme.test',
      address: {
        street: 'Rua das Flores',
        complement: null,
        neighborhood: 'Centro',
        zipCode: '30130-110',
      },
    });
  });
});
