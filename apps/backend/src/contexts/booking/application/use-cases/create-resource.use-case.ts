import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceType, ResourceWorkingHours } from '../../domain/resource.types';
import { ResourceTypeNotCreatableError } from '../../domain/errors/resource.error';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import { StaffWrapValidationService } from '../services/staff-wrap-validation.service';
import { CreateResourceDto } from '../dtos/resource.dto';

export type CreateResourceUseCaseInput = CreateResourceDto & {
  tenantId: string;
  tenantBusinessHours: BusinessHours;
};

export interface CreateResourceUseCaseResult {
  id: string;
  type: ResourceType;
  refId: string | null;
  name: string;
  workingHours: ResourceWorkingHours | null;
  turnoverMinutes: number;
  maxCapacity: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class CreateResourceUseCase {
  constructor(
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    private readonly staffWrapValidation: StaffWrapValidationService,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(TENANT_LOCK_PORT) private readonly tenantLock: ITenantLockPort,
  ) {}

  async execute(input: CreateResourceUseCaseInput): Promise<CreateResourceUseCaseResult> {
    const { tenantId, refId, tenantBusinessHours } = input;
    // input.type is the shared @ikaro/validation Zod schema's plain string-literal union
    // ('STAFF' | 'ROOM' | 'EQUIPMENT') — TS string enums are nominally typed, so a validated
    // literal needs this explicit bridge to the domain's ResourceType enum (same shape as
    // UpdateHotsiteContentUseCase's toDomainLayout() DTO->domain bridge).
    const type = input.type as ResourceType;

    // LOCATION is never manually created — every tenant's one LOCATION resource comes from
    // the M21-S02 backfill migration only (docs/14-API_CONTRACTS.md § Resource Management,
    // plan/M21-MULTIVERTICAL-FOUNDATION.md M21-S01). The schema accepts the value so this
    // rejects with a domain-level 422, not a generic transport-level 400 (Codex round-4
    // finding, PR #457).
    if (type === ResourceType.LOCATION) {
      throw new ResourceTypeNotCreatableError();
    }

    // Fast, non-authoritative pre-check — fails fast on the common case (no concurrent
    // deactivation in flight). The authoritative re-check happens under the tenant-staff
    // advisory lock inside the write transaction below, closing the race against a concurrent
    // StaffDeactivated cascade (M21-S06, closing a gap accepted in M21-S01 — Codex round-6
    // finding, PR #457).
    if (type === ResourceType.STAFF && refId) {
      await this.staffWrapValidation.assertWrappable(refId, tenantId);
    }

    const resource = Resource.create({
      tenantId,
      type,
      name: input.name,
      tenantBusinessHours,
      workingHours: input.workingHours ?? null,
      refId: refId ?? null,
      maxCapacity: input.maxCapacity ?? null,
      turnoverMinutes: input.turnoverMinutes,
    });

    await this.txManager.run(async () => {
      // Serializes against CascadeStaffDeactivationUseCase's own lockTenantStaff acquisition for
      // the same (tenantId, refId): whichever side wins the lock fully determines what the other
      // sees once it proceeds (M21-S06).
      if (type === ResourceType.STAFF && refId) {
        await this.tenantLock.lockTenantStaff(tenantId, refId);
        await this.staffWrapValidation.assertWrappable(refId, tenantId);
      }
      await this.resourceRepo.save(resource);
    });

    return this.toResult(resource);
  }

  private toResult(resource: Resource): CreateResourceUseCaseResult {
    return {
      id: resource.id,
      type: resource.type,
      refId: resource.refId,
      name: resource.name,
      workingHours: resource.workingHours,
      turnoverMinutes: resource.turnoverMinutes,
      maxCapacity: resource.maxCapacity,
      isActive: resource.isActive,
      createdAt: resource.createdAt.toISOString(),
      updatedAt: resource.updatedAt.toISOString(),
    };
  }
}
