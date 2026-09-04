import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceType, ResourceWorkingHours } from '../../domain/resource.types';
import { ResourceNotFoundError } from '../../domain/errors/resource.error';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import { StaffWrapValidationService } from '../services/staff-wrap-validation.service';
import { UpdateResourceDto } from '../dtos/resource.dto';

export type UpdateResourceUseCaseInput = UpdateResourceDto & {
  id: string;
  tenantId: string;
  tenantBusinessHours: BusinessHours;
};

export interface UpdateResourceUseCaseResult {
  id: string;
  type: ResourceType;
  refId: string | null;
  name: string;
  workingHours: ResourceWorkingHours | null;
  turnoverMinutes: number;
  maxCapacity: number | null;
  isActive: boolean;
  updatedAt: string;
}

@Injectable()
export class UpdateResourceUseCase {
  constructor(
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    private readonly staffWrapValidation: StaffWrapValidationService,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(TENANT_LOCK_PORT) private readonly tenantLock: ITenantLockPort,
  ) {}

  async execute(input: UpdateResourceUseCaseInput): Promise<UpdateResourceUseCaseResult> {
    const resource = await this.resourceRepo.findById(input.id, input.tenantId);
    if (!resource) throw new ResourceNotFoundError(input.id);

    // Every field is independently optional in the request (PATCH semantics) — anything not
    // sent falls back to the resource's current value. `refId`/`workingHours`/`maxCapacity` can
    // each be legitimately set to `null`, so they're checked against `undefined` specifically,
    // never `??` (which would also treat an explicit `null` as "not sent").
    const name = input.name ?? resource.name;
    const type = (input.type as ResourceType | undefined) ?? resource.type;
    const refId = input.refId !== undefined ? input.refId : resource.refId;
    const workingHours =
      input.workingHours !== undefined ? input.workingHours : resource.workingHours;
    const turnoverMinutes = input.turnoverMinutes ?? resource.turnoverMinutes;
    const maxCapacity = input.maxCapacity !== undefined ? input.maxCapacity : resource.maxCapacity;

    // Fast, non-authoritative pre-check — same reasoning as CreateResourceUseCase's identical
    // check (see its own comment). The authoritative re-check happens under the tenant-staff
    // advisory lock inside the write transaction below (M21-S06, closing a gap accepted in
    // M21-S01 — Codex round-6/8 finding, PR #457).
    //
    // Only re-validated when refId is actually changing: the frontend always sends refId
    // explicitly (PATCH semantics don't distinguish "unchanged" from "resent"), so gating on
    // `refId !== resource.refId` — not just truthiness — is what lets an unrelated field edit
    // (e.g. turnoverMinutes) succeed on a STAFF resource whose wrapped staff member has since
    // been deactivated (UC-048's cascade already deactivated this resource itself; requiring
    // the staff to still be active here would make every subsequent edit fail, not just ones
    // that touch refId).
    // Captured before resource.update() mutates resource.refId in place below — re-deriving this
    // condition after the mutation would always read the new refId back on both sides and never
    // detect a wrap change.
    const previousRefId = resource.refId;
    const staffWrapChangingTo =
      type === ResourceType.STAFF && refId !== null && refId !== previousRefId ? refId : null;

    if (staffWrapChangingTo !== null) {
      await this.staffWrapValidation.assertWrappable(
        staffWrapChangingTo,
        input.tenantId,
        resource.id,
      );
    }

    resource.update(
      name,
      type,
      refId,
      workingHours,
      turnoverMinutes,
      maxCapacity,
      input.tenantBusinessHours,
    );

    await this.txManager.run(async () => {
      await this.validateUnderLock(input.tenantId, resource.id, staffWrapChangingTo);
      await this.resourceRepo.save(resource);
    });

    return this.toResult(resource);
  }

  // Serializes against CascadeStaffDeactivationUseCase's own lockTenantStaff acquisition for the
  // same (tenantId, refId): whichever side wins the lock fully determines what the other sees
  // once it proceeds (M21-S06). No-op when refId isn't actually changing to a STAFF wrap.
  private async validateUnderLock(
    tenantId: string,
    resourceId: string,
    staffWrapChangingTo: string | null,
  ): Promise<void> {
    if (staffWrapChangingTo === null) return;
    await this.tenantLock.lockTenantStaff(tenantId, staffWrapChangingTo);
    await this.staffWrapValidation.assertWrappable(staffWrapChangingTo, tenantId, resourceId);
  }

  private toResult(resource: Resource): UpdateResourceUseCaseResult {
    return {
      id: resource.id,
      type: resource.type,
      refId: resource.refId,
      name: resource.name,
      workingHours: resource.workingHours,
      turnoverMinutes: resource.turnoverMinutes,
      maxCapacity: resource.maxCapacity,
      isActive: resource.isActive,
      updatedAt: resource.updatedAt.toISOString(),
    };
  }
}
