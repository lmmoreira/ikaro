import { Injectable } from '@nestjs/common';
import { GetStaffUseCase } from '../../../staff/application/use-cases/get-staff.use-case';
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
  constructor(
    private readonly getStaffById: GetStaffByIdUseCase,
    private readonly getStaff: GetStaffUseCase,
  ) {}

  async findNamesByIds(
    staffIds: readonly string[],
    tenantId: string,
  ): Promise<Map<string, string | null>> {
    const ids = [...new Set(staffIds)];
    const names = new Map<string, string | null>(ids.map((id) => [id, null]));
    if (ids.length === 0) return names;

    const { items } = await this.getStaff.execute({
      tenantId,
      ids,
      status: 'ANY',
      limit: ids.length,
      offset: 0,
    });
    for (const staff of items) names.set(staff.id, staff.name);
    return names;
  }

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
