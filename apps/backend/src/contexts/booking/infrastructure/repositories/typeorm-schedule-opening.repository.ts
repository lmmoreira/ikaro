import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Not, QueryFailedError, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';
import { IScheduleOpeningRepository } from '../../application/ports/schedule-opening-repository.port';
import { ScheduleOpening } from '../../domain/schedule-opening.aggregate';
import { ScheduleOpeningAlreadyExistsError } from '../../domain/errors/booking-domain.error';
import { ScheduleOpeningEntity } from '../entities/schedule-opening.entity';

// Matches the two partial unique index names in AddResourceIdToScheduleClosuresAndOpenings —
// UNIQUE (tenant_id, date) WHERE resource_id IS NULL / UNIQUE (tenant_id, resource_id, date)
// WHERE resource_id IS NOT NULL.
const TENANT_WIDE_UNIQUE_INDEX = 'UQ_booking_schedule_openings_tenant_date_no_resource';
const RESOURCE_SCOPED_UNIQUE_INDEX = 'UQ_booking_schedule_openings_tenant_resource_date';

@Injectable()
export class TypeOrmScheduleOpeningRepository implements IScheduleOpeningRepository {
  constructor(
    @InjectRepository(ScheduleOpeningEntity)
    private readonly repo: Repository<ScheduleOpeningEntity>,
  ) {}

  async findByTenantAndDate(
    tenantId: string,
    date: string,
    resourceId?: string,
  ): Promise<ScheduleOpening | null> {
    const entity = await this.repo.findOne({
      where: { tenantId, date, resourceId: resourceId ?? IsNull() },
    });
    return entity ? this.toDomain(entity) : null;
  }

  async findByTenantAndDateRange(
    tenantId: string,
    from: string,
    to: string,
    resourceId?: string,
  ): Promise<ScheduleOpening[]> {
    const entities = await this.repo.find({
      where: { tenantId, date: Between(from, to), resourceId: resourceId ?? IsNull() },
      order: { date: 'ASC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async findById(id: string, tenantId: string): Promise<ScheduleOpening | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  async existsResourceScopedForDate(tenantId: string, date: string): Promise<boolean> {
    return this.repo.exists({ where: { tenantId, date, resourceId: Not(IsNull()) } });
  }

  async save(opening: ScheduleOpening): Promise<void> {
    const entity = this.toEntity(opening);
    const manager = getActiveEntityManager();
    try {
      if (manager) {
        await manager.save(ScheduleOpeningEntity, entity);
      } else {
        await this.repo.save(entity);
      }
    } catch (err) {
      this.rethrowSaveError(err, opening);
    }
  }

  // The application-level pre-check in OpenScheduleUseCase closes the common case; this is the
  // DB-constraint-is-authoritative backstop for the rare concurrent-duplicate-creation race that
  // slips past the advisory lock's coverage (the lock only guards the tenant-window bound, not
  // the plain duplicate check — see open-schedule.use-case.ts). Mirrors
  // typeorm-resource.repository.ts's rethrowSaveError for UQ_booking_resources_tenant_ref_id and
  // typeorm-booking.persistence-errors.ts's rethrowSaveError for EX_booking_bookings_approved_slot
  // (Codex PR #460 round-5 finding).
  private rethrowSaveError(err: unknown, opening: ScheduleOpening): never {
    const driverError =
      err instanceof QueryFailedError
        ? (err as QueryFailedError & {
            code?: string;
            constraint?: string;
            driverError?: { code?: string; constraint?: string };
          })
        : null;
    const code = driverError?.driverError?.code ?? driverError?.code;
    const constraint = driverError?.driverError?.constraint ?? driverError?.constraint;
    if (
      err instanceof QueryFailedError &&
      code === '23505' &&
      (constraint === TENANT_WIDE_UNIQUE_INDEX || constraint === RESOURCE_SCOPED_UNIQUE_INDEX)
    ) {
      throw new ScheduleOpeningAlreadyExistsError(opening.date);
    }
    throw err;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const manager = getActiveEntityManager();
    if (manager) {
      await manager.delete(ScheduleOpeningEntity, { id, tenantId });
    } else {
      await this.repo.delete({ id, tenantId });
    }
  }

  private toDomain(entity: ScheduleOpeningEntity): ScheduleOpening {
    return ScheduleOpening.reconstitute({
      id: entity.id,
      tenantId: entity.tenantId,
      resourceId: entity.resourceId,
      date: entity.date,
      startTime: TimeOfDay.create(entity.startTime),
      endTime: TimeOfDay.create(entity.endTime),
      notes: entity.notes,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt,
    });
  }

  private toEntity(opening: ScheduleOpening): ScheduleOpeningEntity {
    const entity = new ScheduleOpeningEntity();
    entity.id = opening.id;
    entity.tenantId = opening.tenantId;
    entity.resourceId = opening.resourceId;
    entity.date = opening.date;
    entity.startTime = opening.startTime.value;
    entity.endTime = opening.endTime.value;
    entity.notes = opening.notes;
    entity.createdBy = opening.createdBy;
    entity.createdAt = opening.createdAt;
    return entity;
  }
}
