import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { ScheduleClosure } from '../../domain/schedule-closure.aggregate';
import { ScheduleAlreadyClosedError } from '../../domain/errors/booking-domain.error';
import { ResourceNotFoundError } from '../../domain/errors/resource.error';
import {
  IScheduleClosureRepository,
  SCHEDULE_CLOSURE_REPOSITORY,
} from '../ports/schedule-closure-repository.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import { CloseScheduleDto } from '../dtos/close-schedule.dto';

export type CloseScheduleUseCaseInput = CloseScheduleDto & {
  tenantId: string;
  createdBy: string;
};

export interface CloseScheduleUseCaseResult {
  id: string;
  resourceId: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  reason: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

@Injectable()
export class CloseScheduleUseCase {
  constructor(
    @Inject(SCHEDULE_CLOSURE_REPOSITORY)
    private readonly closureRepo: IScheduleClosureRepository,
    @Inject(RESOURCE_REPOSITORY)
    private readonly resourceRepo: IResourceRepository,
    @Inject(TENANT_LOCK_PORT)
    private readonly tenantLock: ITenantLockPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: CloseScheduleUseCaseInput): Promise<CloseScheduleUseCaseResult> {
    const { tenantId, createdBy, resourceId } = input;

    if (resourceId != null) {
      const resource = await this.resourceRepo.findById(resourceId, tenantId);
      if (!resource) throw new ResourceNotFoundError(resourceId);
    }

    const closure = ScheduleClosure.close({
      tenantId,
      date: input.date,
      reason: input.reason,
      createdBy,
      resourceId,
      startTime: input.startTime,
      endTime: input.endTime,
      notes: input.notes,
    });

    await this.txManager.run(async () => {
      // Re-check the overlap invariant under the same per-(tenant, date) advisory lock
      // OpenScheduleUseCase/RemoveScheduleOpeningUseCase use, so two concurrent closure creates
      // for overlapping windows on the same date can't both pass the check before either
      // commits (docs/13-DATABASE_SCHEMA.md § schedule_closures Rules — this overlap check has
      // no DB constraint backing it, since arbitrary time-range overlap can't be expressed as a
      // simple unique index).
      await this.tenantLock.lockTenantDay(tenantId, input.date);

      const existing = await this.closureRepo.findByTenantAndDate(tenantId, input.date, resourceId);
      if (existing.some((c) => c.overlaps(closure.startTime, closure.endTime))) {
        throw new ScheduleAlreadyClosedError(input.date);
      }

      await this.closureRepo.save(closure);
    });

    return this.toResult(closure);
  }

  private toResult(closure: ScheduleClosure): CloseScheduleUseCaseResult {
    return {
      id: closure.id,
      resourceId: closure.resourceId,
      date: closure.date,
      startTime: closure.startTime?.value ?? null,
      endTime: closure.endTime?.value ?? null,
      reason: closure.reason,
      notes: closure.notes,
      createdBy: closure.createdBy,
      createdAt: closure.createdAt.toISOString(),
    };
  }
}
