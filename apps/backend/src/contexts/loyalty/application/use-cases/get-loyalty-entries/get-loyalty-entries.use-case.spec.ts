import { InMemoryLoyaltyEntryRepository } from '../../../../../test/infrastructure/in-memory-loyalty-entry.repository';
import { InMemoryLoyaltyBookingPort } from '../../../../../test/infrastructure/in-memory-loyalty-booking.port';
import { LoyaltyEntryBuilder } from '../../../../../test/builders/loyalty/index';
import { GetLoyaltyEntriesUseCase } from './get-loyalty-entries.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CUSTOMER_ID = 'aaaaaaaa-0000-7000-8000-000000000001';
const SERVICE_ID = 'bbbbbbbb-0000-7000-8000-000000000001';

describe('GetLoyaltyEntriesUseCase', () => {
  let entryRepo: InMemoryLoyaltyEntryRepository;
  let serviceCatalog: InMemoryLoyaltyBookingPort;
  let useCase: GetLoyaltyEntriesUseCase;

  beforeEach(() => {
    entryRepo = new InMemoryLoyaltyEntryRepository();
    serviceCatalog = new InMemoryLoyaltyBookingPort();
    useCase = new GetLoyaltyEntriesUseCase(entryRepo, serviceCatalog);
  });

  it('returns empty list when customer has no entries', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      page: 1,
      limit: 20,
    });

    expect(result.entries).toHaveLength(0);
    expect(result.pagination.total).toBe(0);
  });

  it('resolves serviceName from catalog', async () => {
    serviceCatalog.seed([{ serviceId: SERVICE_ID, serviceName: 'Lavagem Completa' }]);
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withServiceId(SERVICE_ID)
        .withPoints(10)
        .build(),
    );

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      page: 1,
      limit: 20,
    });

    expect(result.entries[0].serviceName).toBe('Lavagem Completa');
    expect(result.entries[0].bookingId).toBeDefined();
  });

  it('falls back to serviceId when service not found in catalog', async () => {
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withServiceId(SERVICE_ID)
        .build(),
    );

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      page: 1,
      limit: 20,
    });

    expect(result.entries[0].serviceName).toBe(SERVICE_ID);
  });

  it('marks expired entries as isActive=false', async () => {
    const past = new Date(Date.now() - 1000);
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withExpiresAt(past)
        .build(),
    );

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      page: 1,
      limit: 20,
    });

    expect(result.entries[0].isActive).toBe(false);
  });

  it('marks future entries as isActive=true', async () => {
    const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withExpiresAt(future)
        .build(),
    );

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      page: 1,
      limit: 20,
    });

    expect(result.entries[0].isActive).toBe(true);
  });

  it('returns pagination metadata', async () => {
    for (let i = 0; i < 3; i++) {
      await entryRepo.save(
        new LoyaltyEntryBuilder().withTenantId(TENANT_ID).withCustomerId(CUSTOMER_ID).build(),
      );
    }

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      page: 1,
      limit: 2,
    });

    expect(result.entries).toHaveLength(2);
    expect(result.pagination).toEqual({ page: 1, limit: 2, total: 3 });
  });

  it('does not return entries from another customer', async () => {
    const otherCustomer = 'cccccccc-0000-7000-8000-000000000001';
    await entryRepo.save(
      new LoyaltyEntryBuilder().withTenantId(TENANT_ID).withCustomerId(otherCustomer).build(),
    );

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      page: 1,
      limit: 20,
    });

    expect(result.entries).toHaveLength(0);
  });
});
