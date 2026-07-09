import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { ICronRunLogRepository } from '../../../../shared/ports/cron-run-log-repository.port';
import { CronRunLogEntity } from '../entities/cron-run-log.entity';

@Injectable()
export class TypeOrmCronRunLogRepository implements ICronRunLogRepository {
  constructor(
    @InjectRepository(CronRunLogEntity)
    private readonly repo: Repository<CronRunLogEntity>,
  ) {}

  async hasRun(tenantId: string, cronDate: string, reminderType: string): Promise<boolean> {
    const count = await this.repo.count({ where: { tenantId, cronDate, reminderType } });
    return count > 0;
  }

  async markRun(tenantId: string, cronDate: string, reminderType: string): Promise<void> {
    const manager = getActiveEntityManager();
    const entity = new CronRunLogEntity();
    entity.tenantId = tenantId;
    entity.cronDate = cronDate;
    entity.reminderType = reminderType;
    const conflictPaths: (keyof CronRunLogEntity)[] = ['tenantId', 'cronDate', 'reminderType'];
    if (manager) {
      await manager.upsert(CronRunLogEntity, entity, conflictPaths);
    } else {
      await this.repo.upsert(entity, conflictPaths);
    }
  }
}
