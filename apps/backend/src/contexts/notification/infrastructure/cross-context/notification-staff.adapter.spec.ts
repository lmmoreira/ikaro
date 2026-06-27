import {
  GetStaffByIdUseCase,
  GetStaffByIdUseCaseResult,
} from '../../../staff/application/use-cases/get-staff-by-id.use-case';
import { GetStaffUseCase } from '../../../staff/application/use-cases/get-staff.use-case';
import { StaffNotFoundError } from '../../../staff/domain/errors/staff-domain.error';
import { NotificationStaffAdapter } from './notification-staff.adapter';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const STAFF_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

const staffResult: GetStaffByIdUseCaseResult = {
  id: STAFF_ID,
  email: 'maria@lavacar.com.br',
  name: 'Maria',
  role: 'MANAGER',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('NotificationStaffAdapter', () => {
  let getStaffById: jest.Mocked<Pick<GetStaffByIdUseCase, 'execute'>>;
  let getStaff: jest.Mocked<Pick<GetStaffUseCase, 'execute'>>;
  let adapter: NotificationStaffAdapter;

  beforeEach(() => {
    getStaffById = { execute: jest.fn() };
    getStaff = { execute: jest.fn() };
    adapter = new NotificationStaffAdapter(
      getStaffById as unknown as GetStaffByIdUseCase,
      getStaff as unknown as GetStaffUseCase,
    );
  });

  it('returns staff info when use case succeeds', async () => {
    getStaffById.execute.mockResolvedValue(staffResult);

    const result = await adapter.getStaffInfo(STAFF_ID, TENANT_ID);

    expect(result).toEqual({ id: STAFF_ID, email: 'maria@lavacar.com.br', name: 'Maria' });
    expect(getStaffById.execute).toHaveBeenCalledWith(STAFF_ID, TENANT_ID);
  });

  it('returns null when staff is not found', async () => {
    getStaffById.execute.mockRejectedValue(new StaffNotFoundError(STAFF_ID));

    const result = await adapter.getStaffInfo(STAFF_ID, TENANT_ID);

    expect(result).toBeNull();
  });

  it('returns null when any error is thrown', async () => {
    getStaffById.execute.mockRejectedValue(new Error('DB error'));

    const result = await adapter.getStaffInfo(STAFF_ID, TENANT_ID);

    expect(result).toBeNull();
  });

  it('maps manager staff results to email addresses', async () => {
    getStaff.execute.mockResolvedValue({
      items: [
        {
          id: 'manager-1',
          email: 'manager@lavacar.com.br',
          name: 'Manager',
          role: 'MANAGER',
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'owner-1',
          email: 'owner@lavacar.com.br',
          name: 'Owner',
          role: 'MANAGER',
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      pagination: { limit: 1000, offset: 0, total: 2, hasMore: false, nextOffset: null },
    });

    const result = await adapter.getManagerEmails(TENANT_ID);

    expect(result).toEqual(['manager@lavacar.com.br', 'owner@lavacar.com.br']);
    expect(getStaff.execute).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      roles: ['MANAGER'],
      status: 'ACTIVE',
      limit: 1000,
      offset: 0,
    });
  });
});
