import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';
import { IScheduleOpeningRepository } from '../../application/ports/schedule-opening-repository.port';
import { ScheduleOpening } from '../../domain/schedule-opening.aggregate';
import { ScheduleOpeningEntity } from '../entities/schedule-opening.entity';

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

  async save(opening: ScheduleOpening): Promise<void> {
    const entity = this.toEntity(opening);
    const manager = getActiveEntityManager();
    if (manager) {
      await manager.save(ScheduleOpeningEntity, entity);
    } else {
      await this.repo.save(entity);
    }
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
