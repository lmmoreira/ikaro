import { Injectable } from '@nestjs/common';
import { GetStaffByIdUseCase } from '../../../staff/application/use-cases/get-staff-by-id.use-case';
import { StaffNotFoundError } from '../../../staff/domain/errors/staff-domain.error';
import {
  BookingStaffProfileDto,
  IBookingStaffPort,
} from '../../application/ports/booking-staff.port';

// "Schedulable" (docs/02-DOMAIN_MODEL.md § Resource: "same-tenant, existing, active, schedulable")
// is isActive only, per story discovery 2026-09-01 — no role restriction, either STAFF or
// MANAGER can be wrapped as a Resource.
@Injectable()
export class BookingStaffAdapter implements IBookingStaffPort {
  constructor(private readonly getStaffById: GetStaffByIdUseCase) {}

  async findActiveById(staffId: string, tenantId: string): Promise<BookingStaffProfileDto | null> {
    try {
      const staff = await this.getStaffById.execute({ staffId, tenantId });
      if (!staff.isActive) return null;
      return { id: staff.id, isActive: staff.isActive };
    } catch (err) {
      // Only the expected not-found outcome collapses to null (a genuine "no such staff
      // member" answer). A transient DB/infra failure must propagate for retry/500
      // diagnosis, not silently masquerade as ResourceStaffNotFoundError (Codex round-3
      // finding, PR #457).
      if (err instanceof StaffNotFoundError) return null;
      throw err;
    }
  }
}
