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

interface ResolvedFields {
  name: string;
  type: ResourceType;
  refId: string | null;
  workingHours: ResourceWorkingHours | null;
  turnoverMinutes: number;
  maxCapacity: number | null;
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
    const preCheck = await this.resourceRepo.findById(input.id, input.tenantId);
    if (!preCheck) throw new ResourceNotFoundError(input.id);

    const fields = this.resolveFields(input, preCheck);

    // Only re-validated when refId is actually changing: the frontend always sends refId
    // explicitly (PATCH semantics don't distinguish "unchanged" from "resent"), so gating on
    // `refId !== preCheck.refId` — not just truthiness — is what lets an unrelated field edit
    // (e.g. turnoverMinutes) succeed on a STAFF resource whose wrapped staff member has since
    // been deactivated (UC-048's cascade already deactivated this resource itself; requiring
    // the staff to still be active here would make every subsequent edit fail, not just ones
    // that touch refId).
    const staffWrapChangingTo =
      fields.type === ResourceType.STAFF && fields.refId !== null && fields.refId !== preCheck.refId
        ? fields.refId
        : null;

    // An edit that leaves an EXISTING STAFF wrap's identity untouched (refId unchanged) still
    // needs to coordinate with a concurrent StaffDeactivated cascade for that same staff member —
    // otherwise this call's save can silently undo the cascade's isActive write, since
    // Resource.update() never touches isActive. The refId-CHANGING case above doesn't need this:
    // once refId moves to a different staff, the resource stops representing the old one, so a
    // cascade racing on the old refId becomes moot regardless of commit order (M21-S06).
    const unchangedStaffWrapRefId =
      staffWrapChangingTo === null && fields.type === ResourceType.STAFF && fields.refId !== null
        ? fields.refId
        : null;
    const lockStaffId = staffWrapChangingTo ?? unchangedStaffWrapRefId;

    // Fast, non-authoritative pre-check — fails fast on the common case. The authoritative
    // re-check (and a fresh re-read, so a concurrently-committed cascade is never silently
    // overwritten) happens under the tenant-staff advisory lock inside the write transaction
    // below (M21-S06, closing a gap accepted in M21-S01 — Codex round-6/8 finding, PR #457).
    if (staffWrapChangingTo !== null) {
      await this.staffWrapValidation.assertWrappable(
        staffWrapChangingTo,
        input.tenantId,
        preCheck.id,
      );
    }

    return this.txManager.run(async () => {
      const resource = await this.resolveUnderLock(
        input,
        preCheck,
        fields,
        lockStaffId,
        staffWrapChangingTo,
      );
      await this.resourceRepo.save(resource);
      return this.toResult(resource);
    });
  }

  // Serializes against CascadeStaffDeactivationUseCase's own lockTenantStaff acquisition for the
  // same (tenantId, staffId): whichever side wins the lock fully determines what the other sees
  // once it proceeds (M21-S06). When a lock is acquired, re-reads the resource fresh before
  // applying the PATCH-merged fields — save() is called on this fresh object, so its isActive
  // (never touched by update()) always reflects the latest committed state instead of the stale
  // snapshot read before the transaction opened.
  private async resolveUnderLock(
    input: UpdateResourceUseCaseInput,
    preCheck: Resource,
    fields: ResolvedFields,
    lockStaffId: string | null,
    staffWrapChangingTo: string | null,
  ): Promise<Resource> {
    if (lockStaffId === null) {
      preCheck.update(
        fields.name,
        fields.type,
        fields.refId,
        fields.workingHours,
        fields.turnoverMinutes,
        fields.maxCapacity,
        input.tenantBusinessHours,
      );
      return preCheck;
    }

    await this.tenantLock.lockTenantStaff(input.tenantId, lockStaffId);
    if (staffWrapChangingTo !== null) {
      await this.staffWrapValidation.assertWrappable(
        staffWrapChangingTo,
        input.tenantId,
        preCheck.id,
      );
    }

    const resource = await this.resourceRepo.findById(input.id, input.tenantId);
    if (!resource) throw new ResourceNotFoundError(input.id);
    resource.update(
      fields.name,
      fields.type,
      fields.refId,
      fields.workingHours,
      fields.turnoverMinutes,
      fields.maxCapacity,
      input.tenantBusinessHours,
    );
    return resource;
  }

  // Every field is independently optional in the request (PATCH semantics) — anything not sent
  // falls back to the resource's current value. `refId`/`workingHours`/`maxCapacity` can each be
  // legitimately set to `null`, so they're checked against `undefined` specifically, never `??`
  // (which would also treat an explicit `null` as "not sent").
  private resolveFields(input: UpdateResourceUseCaseInput, resource: Resource): ResolvedFields {
    return {
      name: input.name ?? resource.name,
      type: (input.type as ResourceType | undefined) ?? resource.type,
      refId: input.refId !== undefined ? input.refId : resource.refId,
      workingHours: input.workingHours !== undefined ? input.workingHours : resource.workingHours,
      turnoverMinutes: input.turnoverMinutes ?? resource.turnoverMinutes,
      maxCapacity: input.maxCapacity !== undefined ? input.maxCapacity : resource.maxCapacity,
    };
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
