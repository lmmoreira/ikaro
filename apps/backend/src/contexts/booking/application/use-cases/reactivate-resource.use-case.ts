import { Inject, Injectable } from '@nestjs/common';
import { mapSequentially } from '../../../../shared/utils/sequential';
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
import {
  FUTURE_COMMITMENT_EXCEPTION_REPOSITORY,
  IFutureCommitmentExceptionRepository,
} from '../ports/future-commitment-exception-repository.port';

export interface ReactivateResourceUseCaseInput {
  id: string;
  tenantId: string;
  staffId: string;
  correlationId: string;
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
    @Inject(FUTURE_COMMITMENT_EXCEPTION_REPOSITORY)
    private readonly exceptionRepo: IFutureCommitmentExceptionRepository,
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

    // The resource itself publishes no event (descoped during story discovery, 2026-09-01: see
    // docs/ENGINEERING_RULES_BACKEND.md § Aggregate domain events → outbox, M20-S16 precedent);
    // the worklist entries closed below each record their own FutureCommitmentExceptionDismissed.
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
      // Same primitive as the raise step, taken after the staff lock (the cascade path takes them
      // in the same order), so a concurrent deactivate of this resource is ordered against us.
      await this.tenantLock.lockResources(input.tenantId, [input.id]);
      // UC-049/UC-077 A3: the deactivation's still-OPEN entries have nothing left to resolve.
      // One batched row lock so a manager resolving one at the same moment cannot also see it OPEN.
      const openEntries = await this.exceptionRepo.findOpenBySourceForUpdate(
        input.tenantId,
        'RESOURCE_DEACTIVATION',
        input.id,
      );
      await mapSequentially(openEntries, async (entry) => {
        entry.dismiss(input.staffId, 'RESOURCE_REACTIVATED', input.correlationId);
        await this.exceptionRepo.save(entry);
      });
      await this.resourceRepo.save(resource);
    });

    return { id: resource.id, isActive: true };
  }
}
