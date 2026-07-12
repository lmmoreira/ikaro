import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { drainDomainEvents } from '../../../../shared/infrastructure/outbox/drain-domain-events';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import { Email } from '../../../../shared/value-objects/email.vo';
import {
  FindAllByTenantResult,
  IStaffRepository,
  StaffFilters,
} from '../../application/ports/staff-repository.port';
import { StaffAlreadyExistsError } from '../../domain/errors/staff-domain.error';
import { Staff, StaffRole } from '../../domain/staff.aggregate';
import { StaffEntity } from '../entities/staff.entity';

@Injectable()
export class TypeOrmStaffRepository implements IStaffRepository {
  constructor(
    @InjectRepository(StaffEntity)
    private readonly repo: Repository<StaffEntity>,
    @Inject(OUTBOX_PUBLISHER)
    private readonly outboxPublisher: IOutboxPublisher,
  ) {}

  async findByTenantAndOAuthId(tenantId: string, googleOAuthId: string): Promise<Staff | null> {
    const entity = await this.repo.findOne({ where: { tenantId, googleOAuthId } });
    return entity ? this.toDomain(entity) : null;
  }

  async findAllByGoogleOAuthId(googleOAuthId: string): Promise<Staff[]> {
    const entities = await this.repo.find({ where: { googleOAuthId } });
    return entities.map((e) => this.toDomain(e));
  }

  async findByTenantAndEmail(tenantId: string, email: string): Promise<Staff | null> {
    const entity = await this.repo.findOne({ where: { tenantId, email } });
    return entity ? this.toDomain(entity) : null;
  }

  async findAllByEmail(email: string): Promise<Staff[]> {
    const entities = await this.repo.find({ where: { email } });
    return entities.map((e) => this.toDomain(e));
  }

  async findById(id: string, tenantId: string): Promise<Staff | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  async findAllByTenant(tenantId: string, filters: StaffFilters): Promise<FindAllByTenantResult> {
    if (filters.ids?.length === 0) return { items: [], total: 0 };
    const query = this.repo
      .createQueryBuilder('staff')
      .where('staff.tenantId = :tenantId', { tenantId })
      .orderBy('staff.createdAt', 'ASC')
      .take(filters.limit)
      .skip(filters.offset);

    if (filters.ids) query.andWhere('staff.id IN (:...ids)', { ids: filters.ids });
    if (filters.roles?.length)
      query.andWhere('staff.role IN (:...roles)', { roles: filters.roles });
    if (filters.status === 'ACTIVE')
      query.andWhere('staff.isActive = :isActive', { isActive: true });
    if (filters.status === 'DEACTIVATED') {
      query.andWhere('staff.isActive = :isActive', { isActive: false });
    }
    if (filters.search) {
      query.andWhere('(staff.name ILIKE :search OR staff.email ILIKE :search)', {
        search: `%${filters.search}%`,
      });
    }

    const [entities, total] = await query.getManyAndCount();
    return { items: entities.map((e) => this.toDomain(e)), total };
  }

  async countActiveManagersByTenant(tenantId: string): Promise<number> {
    const manager = getActiveEntityManager();
    if (manager) {
      // FOR UPDATE cannot be combined with aggregate functions in PostgreSQL.
      // Select the row IDs to acquire locks, then count the results in application code.
      const rows = await manager.query(
        `SELECT id FROM staff.staff
         WHERE tenant_id = $1 AND role = 'MANAGER' AND is_active = true
         FOR UPDATE`,
        [tenantId],
      );
      return rows.length;
    }
    return this.repo.count({ where: { tenantId, role: 'MANAGER', isActive: true } });
  }

  async save(staff: Staff): Promise<void> {
    const entity = this.toEntity(staff);
    const manager = getActiveEntityManager();
    try {
      if (manager) {
        await manager.save(StaffEntity, entity);
      } else {
        await this.repo.save(entity);
      }
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as QueryFailedError & { code: string }).code === '23505'
      ) {
        throw new StaffAlreadyExistsError(staff.email.address);
      }
      throw err;
    }
    await drainDomainEvents(staff, this.outboxPublisher);
  }

  private toDomain(entity: StaffEntity): Staff {
    return Staff.reconstitute({
      id: entity.id,
      tenantId: entity.tenantId,
      googleOAuthId: entity.googleOAuthId,
      name: entity.name,
      email: Email.create(entity.email),
      role: entity.role as StaffRole,
      isActive: entity.isActive,
      invitedBy: entity.invitedBy,
      deactivatedBy: entity.deactivatedBy,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  private toEntity(staff: Staff): StaffEntity {
    const entity = new StaffEntity();
    entity.id = staff.id;
    entity.tenantId = staff.tenantId;
    entity.googleOAuthId = staff.googleOAuthId;
    entity.name = staff.name;
    entity.email = staff.email.address;
    entity.role = staff.role;
    entity.isActive = staff.isActive;
    entity.invitedBy = staff.invitedBy;
    entity.deactivatedBy = staff.deactivatedBy;
    entity.createdAt = staff.createdAt;
    entity.updatedAt = staff.updatedAt;
    return entity;
  }
}
