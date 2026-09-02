import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { ResourceType, ResourceWorkingHours } from '../../domain/resource.types';
import { ResourceNotFoundError } from '../../domain/errors/resource.error';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
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

    // Same known, accepted race as CreateResourceUseCase's identical check (see its own
    // comment) — documented as an accepted limitation rather than built out with new
    // cross-context machinery (Codex round-6/8 finding, PR #457).
    if (type === ResourceType.STAFF && refId) {
      await this.staffWrapValidation.assertWrappable(refId, input.tenantId, resource.id);
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
      await this.resourceRepo.save(resource);
    });

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
