import { Inject, Injectable } from '@nestjs/common';
import {
  ResourceStaffAlreadyWrappedError,
  ResourceStaffNotFoundError,
} from '../../domain/errors/resource.error';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { BOOKING_STAFF_PORT, IBookingStaffPort } from '../ports/booking-staff.port';

// Shared by CreateResourceUseCase and UpdateResourceUseCase — both need to verify a staff
// member is active and not already wrapped by a different Resource before a type=STAFF
// create/update is allowed to proceed (extracted per user decision, PR #457 round 9+, to avoid
// duplicating this check once update-by-type existed too).
@Injectable()
export class StaffWrapValidationService {
  constructor(
    @Inject(BOOKING_STAFF_PORT) private readonly staffPort: IBookingStaffPort,
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
  ) {}

  // excludeResourceId: on update, the resource currently wrapping staffId may be the very
  // resource being updated (an unrelated field changing while refId stays the same) — that is
  // not a conflict. Omit it on create, where no resource being updated could ever be the match.
  async assertWrappable(
    staffId: string,
    tenantId: string,
    excludeResourceId?: string,
  ): Promise<void> {
    const staff = await this.staffPort.findActiveById(staffId, tenantId);
    if (!staff) throw new ResourceStaffNotFoundError(staffId);

    const existing = await this.resourceRepo.findByRefId(staffId, tenantId);
    if (existing && existing.id !== excludeResourceId) {
      throw new ResourceStaffAlreadyWrappedError(staffId);
    }
  }
}
