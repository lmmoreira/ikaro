import {
  GetStaffByIdUseCase,
  GetStaffByIdUseCaseResult,
} from '../../../staff/application/use-cases/get-staff-by-id.use-case';
import { StaffQueryService } from '../../../staff/application/services/staff-query.service';
import { StaffNotFoundError } from '../../../staff/domain/errors/staff-domain.error';
import { StaffInfoAdapter } from './staff-info.adapter';

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

describe('StaffInfoAdapter', () => {
  let getStaffById: jest.Mocked<Pick<GetStaffByIdUseCase, 'execute'>>;
  let staffQueryService: jest.Mocked<Pick<StaffQueryService, 'findManagersByTenant'>>;
  let adapter: StaffInfoAdapter;

  beforeEach(() => {
    getStaffById = { execute: jest.fn() };
    staffQueryService = { findManagersByTenant: jest.fn() };
    adapter = new StaffInfoAdapter(
      getStaffById as unknown as GetStaffByIdUseCase,
      staffQueryService as unknown as StaffQueryService,
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

  it('delegates getManagerEmails to staffQueryService', async () => {
    staffQueryService.findManagersByTenant.mockResolvedValue([
      'manager@lavacar.com.br',
      'owner@lavacar.com.br',
    ]);

    const result = await adapter.getManagerEmails(TENANT_ID);

    expect(result).toEqual(['manager@lavacar.com.br', 'owner@lavacar.com.br']);
    expect(staffQueryService.findManagersByTenant).toHaveBeenCalledWith(TENANT_ID);
  });
});
