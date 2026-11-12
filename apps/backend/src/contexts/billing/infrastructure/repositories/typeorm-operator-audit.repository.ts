import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IOperatorAuditRepository } from '../../application/ports/operator-audit-repository.port';
import type { OperatorAudit } from '../../domain/operator-audit';
import { OperatorAuditEntity } from '../entities/operator-audit.entity';
import { operatorAuditToDomain, operatorAuditToEntity } from './typeorm-operator-audit.mapper';

@Injectable()
export class TypeOrmOperatorAuditRepository implements IOperatorAuditRepository {
  constructor(
    @InjectRepository(OperatorAuditEntity)
    private readonly repo: Repository<OperatorAuditEntity>,
  ) {}

  async save(audit: OperatorAudit): Promise<void> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    await manager.insert(OperatorAuditEntity, operatorAuditToEntity(audit));
  }

  async findByIdAndTenant(tenantId: string, id: string): Promise<OperatorAudit | null> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    const entity = await manager.findOne(OperatorAuditEntity, { where: { tenantId, id } });
    return entity ? operatorAuditToDomain(entity) : null;
  }
}
