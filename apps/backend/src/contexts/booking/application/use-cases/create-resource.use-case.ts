import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceType, ResourceWorkingHours } from '../../domain/resource.types';
import {
  ResourceStaffAlreadyWrappedError,
  ResourceStaffNotFoundError,
} from '../../domain/errors/resource.error';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { BOOKING_STAFF_PORT, IBookingStaffPort } from '../ports/booking-staff.port';
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
    @Inject(BOOKING_STAFF_PORT) private readonly staffPort: IBookingStaffPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: CreateResourceUseCaseInput): Promise<CreateResourceUseCaseResult> {
    const { tenantId, type, refId, tenantBusinessHours } = input;

    if (type === ResourceType.STAFF && refId) {
      await this.assertStaffWrappable(refId, tenantId);
    }

    const resource = Resource.create(
      tenantId,
      type,
      input.name,
      tenantBusinessHours,
      input.workingHours ?? null,
      refId ?? null,
      input.maxCapacity ?? null,
      input.turnoverMinutes,
    );

    await this.txManager.run(async () => {
      await this.resourceRepo.save(resource);
    });

    return this.toResult(resource);
  }

  private async assertStaffWrappable(staffId: string, tenantId: string): Promise<void> {
    const staff = await this.staffPort.findActiveById(staffId, tenantId);
    if (!staff) throw new ResourceStaffNotFoundError(staffId);

    const existing = await this.resourceRepo.findByRefId(staffId, tenantId);
    if (existing) throw new ResourceStaffAlreadyWrappedError(staffId);
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
