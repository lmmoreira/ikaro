import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  ResourceNotFoundError,
  ResourceStaffNotFoundError,
} from '../../domain/errors/resource.error';
import { ResourceType } from '../../domain/resource.types';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { BOOKING_STAFF_PORT, IBookingStaffPort } from '../ports/booking-staff.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';

export interface ReactivateResourceUseCaseInput {
  id: string;
  tenantId: string;
}

export interface ReactivateResourceUseCaseResult {
  id: string;
  isActive: true;
}

@Injectable()
export class ReactivateResourceUseCase {
  constructor(
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(BOOKING_STAFF_PORT) private readonly staffPort: IBookingStaffPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(TENANT_LOCK_PORT) private readonly tenantLock: ITenantLockPort,
  ) {}

  async execute(input: ReactivateResourceUseCaseInput): Promise<ReactivateResourceUseCaseResult> {
    const resource = await this.resourceRepo.findById(input.id, input.tenantId);
    if (!resource) throw new ResourceNotFoundError(input.id);

    // A STAFF wrapper must not be reactivated while its Staff row is still inactive — UC-048's
    // cascade deactivates the wrapper when Staff is deactivated, and reactivating the resource
    // alone (without the Staff row also being active again) would silently make an inactive
    // staff member schedulable again (Codex round-7 finding, PR #457).
    //
    // Fast, non-authoritative pre-check — same reasoning as CreateResourceUseCase's identical
    // check (see its own comment). The authoritative re-check happens under the tenant-staff
    // advisory lock inside the write transaction below (M21-S06, closing a gap accepted in
    // M21-S01 — Codex round-8 finding, PR #457). reactivate() below never touches refId, so this
    // captured value stays valid for the in-transaction re-check too.
    const staffRefId = resource.type === ResourceType.STAFF ? resource.refId : null;
    if (staffRefId !== null) {
      const staff = await this.staffPort.findActiveById(staffRefId, input.tenantId);
      if (!staff) throw new ResourceStaffNotFoundError(staffRefId);
    }

    // Config-only, no event published — descoped during story discovery (2026-09-01): see
    // docs/ENGINEERING_RULES.md § Aggregate domain events → outbox (M20-S16 precedent).
    resource.reactivate();

    await this.txManager.run(async () => {
      // Serializes against CascadeStaffDeactivationUseCase's own lockTenantStaff acquisition for
      // the same (tenantId, refId): whichever side wins the lock fully determines what the other
      // sees once it proceeds (M21-S06).
      if (staffRefId !== null) {
        await this.tenantLock.lockTenantStaff(input.tenantId, staffRefId);
        const staff = await this.staffPort.findActiveById(staffRefId, input.tenantId);
        if (!staff) throw new ResourceStaffNotFoundError(staffRefId);
      }
      await this.resourceRepo.save(resource);
    });

    return { id: resource.id, isActive: true };
  }
}
