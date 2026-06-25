import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { Email } from '../../../../shared/value-objects/email.vo';
import {
  FindAllByTenantResult,
  IStaffRepository,
} from '../../application/ports/staff-repository.port';
import { StaffAlreadyExistsError } from '../../domain/errors/staff-domain.error';
import { Staff, StaffRole } from '../../domain/staff.aggregate';
import { StaffEntity } from '../entities/staff.entity';

@Injectable()
export class TypeOrmStaffRepository implements IStaffRepository {
  constructor(
    @InjectRepository(StaffEntity)
    private readonly repo: Repository<StaffEntity>,
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

  async findAllByTenant(
    tenantId: string,
    limit: number,
    offset: number,
  ): Promise<FindAllByTenantResult> {
    const [entities, total] = await this.repo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'ASC' },
      take: limit,
      skip: offset,
    });
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
