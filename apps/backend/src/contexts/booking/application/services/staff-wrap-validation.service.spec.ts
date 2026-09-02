import { InMemoryBookingStaffPort } from '../../../../test/infrastructure/in-memory-booking-staff.port';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import {
  ResourceStaffAlreadyWrappedError,
  ResourceStaffNotFoundError,
} from '../../domain/errors/resource.error';
import { ResourceType } from '../../domain/resource.types';
import { StaffWrapValidationService } from './staff-wrap-validation.service';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const STAFF_ID = '00000000-0000-7000-8000-000000000002';

describe('StaffWrapValidationService', () => {
  let repo: InMemoryResourceRepository;
  let staffPort: InMemoryBookingStaffPort;
  let service: StaffWrapValidationService;

  beforeEach(() => {
    repo = new InMemoryResourceRepository();
    staffPort = new InMemoryBookingStaffPort();
    service = new StaffWrapValidationService(staffPort, repo);
  });

  it('resolves when the staff member is active and not wrapped by any resource', async () => {
    staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });

    await expect(service.assertWrappable(STAFF_ID, TENANT_ID)).resolves.toBeUndefined();
  });

  it('throws ResourceStaffNotFoundError when the staff member is not found or inactive', async () => {
    staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: false });

    await expect(service.assertWrappable(STAFF_ID, TENANT_ID)).rejects.toThrow(
      ResourceStaffNotFoundError,
    );
  });

  it('throws ResourceStaffAlreadyWrappedError when a different resource already wraps the staff member', async () => {
    staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });
    await repo.save(
      new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.STAFF)
        .withRefId(STAFF_ID)
        .build(),
    );

    await expect(service.assertWrappable(STAFF_ID, TENANT_ID)).rejects.toThrow(
      ResourceStaffAlreadyWrappedError,
    );
  });

  it('does not treat the excluded resource id as a conflict (update self-check)', async () => {
    staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });
    const existing = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId(STAFF_ID)
      .build();
    await repo.save(existing);

    await expect(
      service.assertWrappable(STAFF_ID, TENANT_ID, existing.id),
    ).resolves.toBeUndefined();
  });

  it('still throws for a different existing wrap even when an excludeResourceId is passed', async () => {
    staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });
    const existing = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId(STAFF_ID)
      .build();
    await repo.save(existing);

    await expect(
      service.assertWrappable(STAFF_ID, TENANT_ID, 'a-different-resource-id'),
    ).rejects.toThrow(ResourceStaffAlreadyWrappedError);
  });
});
