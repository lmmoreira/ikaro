import { GetCustomerTenantsByIdUseCase } from '../../../customer/application/use-cases/get-customer-tenants-by-id.use-case';
import { CustomerNotFoundError } from '../../../customer/domain/errors/customer-domain.error';
import { LoyaltyCustomerNotFoundInTenantError } from '../../domain/errors/loyalty-domain.error';
import { LoyaltyCustomerAdapter } from './loyalty-customer.adapter';

const HOME_TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const TARGET_TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const HOME_CUSTOMER_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const TARGET_CUSTOMER_ID = 'bbbbbbbb-0000-4000-8000-000000000002';

describe('LoyaltyCustomerAdapter', () => {
  let getCustomerTenantsById: jest.Mocked<Pick<GetCustomerTenantsByIdUseCase, 'execute'>>;
  let adapter: LoyaltyCustomerAdapter;

  beforeEach(() => {
    getCustomerTenantsById = { execute: jest.fn() };
    adapter = new LoyaltyCustomerAdapter(
      getCustomerTenantsById as unknown as GetCustomerTenantsByIdUseCase,
    );
  });

  afterEach(() => jest.resetAllMocks());

  it('resolves the customer ID in the target tenant for the same OAuth user', async () => {
    getCustomerTenantsById.execute.mockResolvedValue([
      { tenantId: HOME_TENANT_ID, customerId: HOME_CUSTOMER_ID },
      { tenantId: TARGET_TENANT_ID, customerId: TARGET_CUSTOMER_ID },
    ]);

    const result = await adapter.resolveCustomerIdByOAuthId(
      HOME_CUSTOMER_ID,
      HOME_TENANT_ID,
      TARGET_TENANT_ID,
    );

    expect(result).toBe(TARGET_CUSTOMER_ID);
    expect(getCustomerTenantsById.execute).toHaveBeenCalledWith({
      customerId: HOME_CUSTOMER_ID,
      tenantId: HOME_TENANT_ID,
    });
  });

  it('throws LoyaltyCustomerNotFoundInTenantError when the user has no record in the target tenant', async () => {
    getCustomerTenantsById.execute.mockResolvedValue([
      { tenantId: HOME_TENANT_ID, customerId: HOME_CUSTOMER_ID },
    ]);

    await expect(
      adapter.resolveCustomerIdByOAuthId(HOME_CUSTOMER_ID, HOME_TENANT_ID, TARGET_TENANT_ID),
    ).rejects.toThrow(LoyaltyCustomerNotFoundInTenantError);
  });

  it('throws LoyaltyCustomerNotFoundInTenantError (not the raw customer-context error) when the home customer does not exist', async () => {
    getCustomerTenantsById.execute.mockRejectedValue(new CustomerNotFoundError(HOME_CUSTOMER_ID));

    await expect(
      adapter.resolveCustomerIdByOAuthId(HOME_CUSTOMER_ID, HOME_TENANT_ID, TARGET_TENANT_ID),
    ).rejects.toThrow(LoyaltyCustomerNotFoundInTenantError);
  });
});
