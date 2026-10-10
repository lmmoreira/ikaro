import { GetStaffUseCase } from '../../../staff/application/use-cases/get-staff.use-case';
import { GetStaffByIdUseCase } from '../../../staff/application/use-cases/get-staff-by-id.use-case';
import { StaffNotFoundError } from '../../../staff/domain/errors/staff-domain.error';
import { BookingStaffAdapter } from './booking-staff.adapter';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const STAFF_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

describe('BookingStaffAdapter', () => {
  let getStaffById: jest.Mocked<Pick<GetStaffByIdUseCase, 'execute'>>;
  let getStaff: jest.Mocked<Pick<GetStaffUseCase, 'execute'>>;
  let adapter: BookingStaffAdapter;

  beforeEach(() => {
    getStaffById = { execute: jest.fn() };
    getStaff = { execute: jest.fn() };
    adapter = new BookingStaffAdapter(
      getStaffById as unknown as GetStaffByIdUseCase,
      getStaff as unknown as GetStaffUseCase,
    );
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
  describe('findNamesByIds', () => {
    const OTHER_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
    const item = (id: string, name: string | null) => ({
      id,
      email: `${id}@lavacar.com.br`,
      name,
      role: 'STAFF' as const,
      isActive: false,
      googleOAuthId: null,
      createdAt: new Date().toISOString(),
    });

    it('resolves every distinct id in one tenant-scoped read, deactivated staff included', async () => {
      getStaff.execute.mockResolvedValue({
        items: [item(STAFF_ID, 'Camila Duarte'), item(OTHER_ID, null)],
        pagination: { limit: 2, offset: 0, total: 2, hasMore: false, nextOffset: null },
      });

      const names = await adapter.findNamesByIds([STAFF_ID, OTHER_ID, STAFF_ID], TENANT_ID);

      expect(getStaff.execute).toHaveBeenCalledTimes(1);
      expect(getStaff.execute).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        ids: [STAFF_ID, OTHER_ID],
        status: 'ANY',
        limit: 2,
        offset: 0,
      });
      expect(names).toEqual(
        new Map([
          [STAFF_ID, 'Camila Duarte'],
          [OTHER_ID, null],
        ]),
      );
    });

    it('maps an id the tenant does not own to null', async () => {
      getStaff.execute.mockResolvedValue({
        items: [],
        pagination: { limit: 1, offset: 0, total: 0, hasMore: false, nextOffset: null },
      });

      const names = await adapter.findNamesByIds([STAFF_ID], TENANT_ID);

      expect(names.get(STAFF_ID)).toBeNull();
    });

    it('does not query when there are no ids', async () => {
      const names = await adapter.findNamesByIds([], TENANT_ID);

      expect(names.size).toBe(0);
      expect(getStaff.execute).not.toHaveBeenCalled();
    });
  });
});
