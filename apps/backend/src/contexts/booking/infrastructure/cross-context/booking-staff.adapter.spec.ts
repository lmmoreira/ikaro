import { GetStaffByIdUseCase } from '../../../staff/application/use-cases/get-staff-by-id.use-case';
import { StaffNotFoundError } from '../../../staff/domain/errors/staff-domain.error';
import { BookingStaffAdapter } from './booking-staff.adapter';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const STAFF_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

describe('BookingStaffAdapter', () => {
  let getStaffById: jest.Mocked<Pick<GetStaffByIdUseCase, 'execute'>>;
  let adapter: BookingStaffAdapter;

  beforeEach(() => {
    getStaffById = { execute: jest.fn() };
    adapter = new BookingStaffAdapter(getStaffById as unknown as GetStaffByIdUseCase);
  });

  it('returns the staff profile when active', async () => {
    getStaffById.execute.mockResolvedValue({
      id: STAFF_ID,
      email: 'camila@lavacar.com.br',
      name: 'Camila Duarte',
      role: 'STAFF',
      isActive: true,
      createdAt: new Date().toISOString(),
    });

    const result = await adapter.findActiveById(STAFF_ID, TENANT_ID);

    expect(result).toEqual({ id: STAFF_ID, isActive: true });
    expect(getStaffById.execute).toHaveBeenCalledWith({ staffId: STAFF_ID, tenantId: TENANT_ID });
  });

  it('returns null when the staff member is inactive', async () => {
    getStaffById.execute.mockResolvedValue({
      id: STAFF_ID,
      email: 'camila@lavacar.com.br',
      name: 'Camila Duarte',
      role: 'STAFF',
      isActive: false,
      createdAt: new Date().toISOString(),
    });

    const result = await adapter.findActiveById(STAFF_ID, TENANT_ID);

    expect(result).toBeNull();
  });

  it('returns null when the staff member is not found', async () => {
    getStaffById.execute.mockRejectedValue(new StaffNotFoundError(STAFF_ID));

    const result = await adapter.findActiveById(STAFF_ID, TENANT_ID);

    expect(result).toBeNull();
  });

  it('propagates an unexpected error instead of masking it as not-found', async () => {
    const dbError = new Error('connection reset');
    getStaffById.execute.mockRejectedValue(dbError);

    await expect(adapter.findActiveById(STAFF_ID, TENANT_ID)).rejects.toBe(dbError);
  });
});
