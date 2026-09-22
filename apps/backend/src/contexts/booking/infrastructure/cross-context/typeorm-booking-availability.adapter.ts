import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { localDateRangeBoundsUTC } from '../../../../shared/utils/calendar-date';
import { IBookingAvailabilityPort } from '../../application/ports/booking-availability.port';
import { ResourceOccupiedSlot } from '../../domain/resource-occupied-slot';
import { ResourceOccupancyEntity } from '../entities/resource-occupancy.entity';

@Injectable()
export class TypeOrmBookingAvailabilityAdapter implements IBookingAvailabilityPort {
  constructor(
    @InjectRepository(ResourceOccupancyEntity)
    private readonly repo: Repository<ResourceOccupancyEntity>,
  ) {}

  async findOccupancyByTenantAndResource(
    tenantId: string,
    resourceIds: string[],
    from: string,
    to: string,
    timezone: string,
  ): Promise<ResourceOccupiedSlot[]> {
    if (resourceIds.length === 0) return [];
    const manager = getActiveEntityManager();
    const repository = manager ? manager.getRepository(ResourceOccupancyEntity) : this.repo;

    const { start: isoStart, end: isoEnd } = localDateRangeBoundsUTC(from, to, timezone);

    const rows: { resourceId: string; startsAt: Date; endsAt: Date }[] = await repository
      .createQueryBuilder('ro')
      .select([
        'ro.resourceId AS "resourceId"',
        'ro.startsAt AS "startsAt"',
        'ro.endsAt AS "endsAt"',
      ])
      .where('ro.tenantId = :tenantId', { tenantId })
      .andWhere('ro.resourceId IN (:...resourceIds)', { resourceIds })
      .andWhere("ro.lockState IN ('HOLD', 'COMMITTED')")
      // Half-open [starts_at, ends_at) overlap against the queried [isoStart, isoEnd) window —
      // same overlap semantics as the GIST exclusion constraint itself.
      .andWhere('ro.startsAt < :isoEnd', { isoEnd })
      .andWhere('ro.endsAt > :isoStart', { isoStart })
      .getRawMany();

    return rows.map((row) => ({
      resourceId: row.resourceId,
      startsAt: new Date(row.startsAt),
      endsAt: new Date(row.endsAt),
    }));
  }
}
