import { CustomerBuilder } from '../../../../test/builders/customer';
import { InMemoryCustomerRepository } from '../../../../test/repositories/customer/in-memory-customer.repository';
import { FindOrCreateCustomerUseCase } from './find-or-create-customer.use-case';

describe('FindOrCreateCustomerUseCase', () => {
  let repo: InMemoryCustomerRepository;
  let useCase: FindOrCreateCustomerUseCase;

  const dto = {
    tenantId: '00000000-0000-0000-0000-000000000001',
    googleOAuthId: 'google-sub-123',
    email: 'joao@lavacar.com.br',
    name: 'João Silva',
  };

  beforeEach(() => {
    repo = new InMemoryCustomerRepository();
    useCase = new FindOrCreateCustomerUseCase(repo);
  });

  it('creates a new customer when none exists for the tenant + oauth id', async () => {
    const result = await useCase.execute(dto);

    expect(result.created).toBe(true);
    expect(result.customerId).toBeTruthy();
    const saved = await repo.findByTenantAndOAuthId(dto.tenantId, dto.googleOAuthId);
    expect(saved).not.toBeNull();
    expect(saved!.email.address).toBe('joao@lavacar.com.br');
  });

  it('returns the existing customer without creating a duplicate (idempotent)', async () => {
    const existing = new CustomerBuilder()
      .withTenantId(dto.tenantId)
      .withGoogleOAuthId(dto.googleOAuthId)
      .withEmail(dto.email)
      .build();
    await repo.save(existing);

    const result = await useCase.execute(dto);

    expect(result.created).toBe(false);
    expect(result.customerId).toBe(existing.id);
  });

  it('creates separate customer records for different tenants with the same google account', async () => {
    const resultA = await useCase.execute({ ...dto, tenantId: 'tenant-a' });
    const resultB = await useCase.execute({ ...dto, tenantId: 'tenant-b' });

    expect(resultA.customerId).not.toBe(resultB.customerId);
    expect(resultA.created).toBe(true);
    expect(resultB.created).toBe(true);
  });
});
