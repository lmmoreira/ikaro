import { ICustomerTenantLookup } from '../../../customer/application/ports/customer-tenant-lookup.port';
import { LoyaltyCustomerNotFoundInTenantError } from '../../domain/errors/loyalty-domain.error';
import { LoyaltyCustomerAdapter } from './loyalty-customer.adapter';

const HOME_TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const TARGET_TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const HOME_CUSTOMER_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const TARGET_CUSTOMER_ID = 'bbbbbbbb-0000-4000-8000-000000000002';

describe('LoyaltyCustomerAdapter', () => {
  let customerTenantLookup: jest.Mocked<ICustomerTenantLookup>;
  let adapter: LoyaltyCustomerAdapter;

  beforeEach(() => {
    customerTenantLookup = { find: jest.fn() };
    adapter = new LoyaltyCustomerAdapter(customerTenantLookup);
  });

  afterEach(() => jest.resetAllMocks());

  it('resolves the customer ID in the target tenant for the same OAuth user', async () => {
    customerTenantLookup.find.mockResolvedValue([
      { tenantId: HOME_TENANT_ID, customerId: HOME_CUSTOMER_ID },
      { tenantId: TARGET_TENANT_ID, customerId: TARGET_CUSTOMER_ID },
    ]);

    const result = await adapter.resolveCustomerIdByOAuthId(
      HOME_CUSTOMER_ID,
      HOME_TENANT_ID,
      TARGET_TENANT_ID,
    );

    expect(result).toBe(TARGET_CUSTOMER_ID);
    expect(customerTenantLookup.find).toHaveBeenCalledWith({
      customerId: HOME_CUSTOMER_ID,
      tenantId: HOME_TENANT_ID,
    });
  });

  it('throws LoyaltyCustomerNotFoundInTenantError when the user has no record in the target tenant', async () => {
    customerTenantLookup.find.mockResolvedValue([
      { tenantId: HOME_TENANT_ID, customerId: HOME_CUSTOMER_ID },
    ]);

    await expect(
      adapter.resolveCustomerIdByOAuthId(HOME_CUSTOMER_ID, HOME_TENANT_ID, TARGET_TENANT_ID),
    ).rejects.toThrow(LoyaltyCustomerNotFoundInTenantError);
  });

  it('throws LoyaltyCustomerNotFoundInTenantError when the home customer does not exist', async () => {
    customerTenantLookup.find.mockResolvedValue(null);

    await expect(
      adapter.resolveCustomerIdByOAuthId(HOME_CUSTOMER_ID, HOME_TENANT_ID, TARGET_TENANT_ID),
    ).rejects.toThrow(LoyaltyCustomerNotFoundInTenantError);
  });

  it('propagates unrelated failures unchanged', async () => {
    const dbError = new Error('connection terminated unexpectedly');
    customerTenantLookup.find.mockRejectedValue(dbError);

    await expect(
      adapter.resolveCustomerIdByOAuthId(HOME_CUSTOMER_ID, HOME_TENANT_ID, TARGET_TENANT_ID),
    ).rejects.toThrow(dbError);
  });

  describe('resolveAllTenantsByOAuthId()', () => {
    it('returns every tenant/customerId pair for the same OAuth user, unfiltered', async () => {
      customerTenantLookup.find.mockResolvedValue([
        { tenantId: HOME_TENANT_ID, customerId: HOME_CUSTOMER_ID },
        { tenantId: TARGET_TENANT_ID, customerId: TARGET_CUSTOMER_ID },
      ]);

      const result = await adapter.resolveAllTenantsByOAuthId(HOME_CUSTOMER_ID, HOME_TENANT_ID);

      expect(result).toEqual([
        { tenantId: HOME_TENANT_ID, customerId: HOME_CUSTOMER_ID },
        { tenantId: TARGET_TENANT_ID, customerId: TARGET_CUSTOMER_ID },
      ]);
      expect(customerTenantLookup.find).toHaveBeenCalledWith({
        customerId: HOME_CUSTOMER_ID,
        tenantId: HOME_TENANT_ID,
      });
    });

    it('throws LoyaltyCustomerNotFoundInTenantError when the home customer does not exist', async () => {
      customerTenantLookup.find.mockResolvedValue(null);

      await expect(
        adapter.resolveAllTenantsByOAuthId(HOME_CUSTOMER_ID, HOME_TENANT_ID),
      ).rejects.toThrow(LoyaltyCustomerNotFoundInTenantError);
    });

    it('propagates unrelated failures (e.g. a DB error) unchanged instead of masking them as not-found', async () => {
      const dbError = new Error('connection terminated unexpectedly');
      customerTenantLookup.find.mockRejectedValue(dbError);

      await expect(
        adapter.resolveAllTenantsByOAuthId(HOME_CUSTOMER_ID, HOME_TENANT_ID),
      ).rejects.toThrow(dbError);
    });
  });
});
