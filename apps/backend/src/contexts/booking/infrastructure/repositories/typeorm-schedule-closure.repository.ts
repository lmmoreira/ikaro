import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';
import { IScheduleClosureRepository } from '../../application/ports/schedule-closure-repository.port';
import { ScheduleClosure } from '../../domain/schedule-closure.aggregate';
import { ScheduleClosureEntity } from '../entities/schedule-closure.entity';

@Injectable()
export class TypeOrmScheduleClosureRepository implements IScheduleClosureRepository {
  constructor(
    @InjectRepository(ScheduleClosureEntity)
    private readonly repo: Repository<ScheduleClosureEntity>,
  ) {}

  async findByTenantAndDateRange(
    tenantId: string,
    from: string,
    to: string,
    resourceId?: string,
  ): Promise<ScheduleClosure[]> {
    const entities = await this.repo.find({
      where: { tenantId, date: Between(from, to), resourceId: resourceId ?? IsNull() },
      order: { date: 'ASC', startTime: 'ASC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async findByTenantAndDate(
    tenantId: string,
    date: string,
    resourceId?: string,
  ): Promise<ScheduleClosure[]> {
    const entities = await this.repo.find({
      where: { tenantId, date, resourceId: resourceId ?? IsNull() },
      order: { startTime: 'ASC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async findById(id: string, tenantId: string): Promise<ScheduleClosure | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  async save(closure: ScheduleClosure): Promise<void> {
    const entity = this.toEntity(closure);
    const manager = getActiveEntityManager();
    if (manager) {
      await manager.save(ScheduleClosureEntity, entity);
    } else {
      await this.repo.save(entity);
    }
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const manager = getActiveEntityManager();
    if (manager) {
      await manager.delete(ScheduleClosureEntity, { id, tenantId });
    } else {
      await this.repo.delete({ id, tenantId });
    }
  }

  private toDomain(entity: ScheduleClosureEntity): ScheduleClosure {
    return ScheduleClosure.reconstitute({
      id: entity.id,
      tenantId: entity.tenantId,
      resourceId: entity.resourceId,
      date: entity.date,
      startTime: entity.startTime ? TimeOfDay.create(entity.startTime) : null,
      endTime: entity.endTime ? TimeOfDay.create(entity.endTime) : null,
      reason: entity.reason,
      notes: entity.notes,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt,
    });
  }

  private toEntity(closure: ScheduleClosure): ScheduleClosureEntity {
    const entity = new ScheduleClosureEntity();
    entity.id = closure.id;
    entity.tenantId = closure.tenantId;
    entity.resourceId = closure.resourceId;
    entity.date = closure.date;
    entity.startTime = closure.startTime?.value ?? null;
    entity.endTime = closure.endTime?.value ?? null;
    entity.reason = closure.reason;
    entity.notes = closure.notes;
    entity.createdBy = closure.createdBy;
    entity.createdAt = closure.createdAt;
    return entity;
  }
}
