import { StaffBuilder } from '../../../../test/builders/staff';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { StaffNotFoundError } from '../../domain/errors/staff-domain.error';
import { GetStaffByIdUseCase } from './get-staff-by-id.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('GetStaffByIdUseCase', () => {
  let repo: InMemoryStaffRepository;
  let useCase: GetStaffByIdUseCase;

  beforeEach(() => {
    repo = new InMemoryStaffRepository();
    useCase = new GetStaffByIdUseCase(repo);
  });

  it('throws StaffNotFoundError when no staff with that id exists', async () => {
    await expect(useCase.execute({ staffId: 'non-existent', tenantId: TENANT_A })).rejects.toThrow(
      StaffNotFoundError,
    );
  });

  it('returns the staff member with correct shape', async () => {
    const staff = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withEmail('gerente@lavacar.com.br')
      .withRole('MANAGER')
      .withGoogleOAuthId('google-sub-1')
      .withName('Gerente Silva')
      .build();
    await repo.save(staff);

    const result = await useCase.execute({ staffId: staff.id, tenantId: TENANT_A });

    expect(result.id).toBe(staff.id);
    expect(result.email).toBe('gerente@lavacar.com.br');
    expect(result.name).toBe('Gerente Silva');
    expect(result.role).toBe('MANAGER');
    expect(result.isActive).toBe(true);
    expect(result.createdAt).toBeDefined();
  });

  it('name is stored at invite time for newly invited (not yet linked) staff', async () => {
    const invited = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withEmail('invited@lavacar.com.br')
      .withName('Test User')
      .build();
    await repo.save(invited);

    const result = await useCase.execute({ staffId: invited.id, tenantId: TENANT_A });

    expect(result.name).toBe('Test User');
    expect(result.isActive).toBe(true);
  });

  it('tenant isolation: throws StaffNotFoundError when id exists but belongs to another tenant', async () => {
    const staff = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withEmail('staff@tenanta.com.br')
      .build();
    await repo.save(staff);

    await expect(useCase.execute({ staffId: staff.id, tenantId: TENANT_B })).rejects.toThrow(
      StaffNotFoundError,
    );
  });
});
