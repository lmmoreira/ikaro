import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  IResourceRepository,
  ListResourcesFilter,
} from '../../application/ports/resource-repository.port';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceStaffAlreadyWrappedError } from '../../domain/errors/resource.error';
import { ResourceType } from '../../domain/resource.types';
import { ResourceEntity } from '../entities/resource.entity';

// Matches the partial unique index name in the CreateBookingResources migration —
// UNIQUE (tenant_id, ref_id) WHERE type='STAFF' AND ref_id IS NOT NULL.
const STAFF_REF_ID_UNIQUE_INDEX = 'UQ_booking_resources_tenant_ref_id';

@Injectable()
export class TypeOrmResourceRepository implements IResourceRepository {
  constructor(
    @InjectRepository(ResourceEntity)
    private readonly repo: Repository<ResourceEntity>,
  ) {}

  async findByTenant(tenantId: string, filter: ListResourcesFilter): Promise<Resource[]> {
    const entities = await this.repo.find({
      where: {
        tenantId,
        ...(filter.type !== undefined ? { type: filter.type } : {}),
        ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
      },
      order: { type: 'ASC', name: 'ASC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async findById(id: string, tenantId: string): Promise<Resource | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByRefId(refId: string, tenantId: string): Promise<Resource | null> {
    // Explicit type='STAFF' matches the partial unique index's own WHERE predicate — refId is
    // only ever non-null on a STAFF row (CHK_booking_resources_type_ref_id), so this is
    // defensive/index-matching explicitness, not a correctness fix (Codex round-6 finding, PR
    // #457).
    const entity = await this.repo.findOne({
      where: { refId, tenantId, type: ResourceType.STAFF },
    });
    return entity ? this.toDomain(entity) : null;
  }

  async save(resource: Resource): Promise<void> {
    const entity = this.toEntity(resource);
    const manager = getActiveEntityManager();
    try {
      if (manager) {
        await manager.save(ResourceEntity, entity);
      } else {
        await this.repo.save(entity);
      }
    } catch (err) {
      this.rethrowSaveError(err, resource);
    }
  }

  // The application-level pre-check in CreateResourceUseCase closes the common case; this is the
  // DB-constraint-is-authoritative backstop for the rare concurrent-duplicate-wrap race (mirrors
  // typeorm-booking.persistence-errors.ts's rethrowSaveError for EX_booking_bookings_approved_slot,
  // and typeorm-staff.repository.ts's inline 23505 check for StaffAlreadyExistsError).
  private rethrowSaveError(err: unknown, resource: Resource): never {
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
      constraint === STAFF_REF_ID_UNIQUE_INDEX &&
      resource.refId
    ) {
      throw new ResourceStaffAlreadyWrappedError(resource.refId);
    }
    throw err;
  }

  private toDomain(entity: ResourceEntity): Resource {
    return Resource.reconstitute({
      id: entity.id,
      tenantId: entity.tenantId,
      type: entity.type,
      refId: entity.refId,
      name: entity.name,
      workingHours: entity.workingHours,
      turnoverMinutes: entity.turnoverMinutes,
      maxCapacity: entity.maxCapacity,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  private toEntity(resource: Resource): ResourceEntity {
    const entity = new ResourceEntity();
    entity.id = resource.id;
    entity.tenantId = resource.tenantId;
    entity.type = resource.type;
    entity.refId = resource.refId;
    entity.name = resource.name;
    entity.workingHours = resource.workingHours;
    entity.turnoverMinutes = resource.turnoverMinutes;
    entity.maxCapacity = resource.maxCapacity;
    entity.isActive = resource.isActive;
    entity.createdAt = resource.createdAt;
    entity.updatedAt = resource.updatedAt;
    return entity;
  }
}
