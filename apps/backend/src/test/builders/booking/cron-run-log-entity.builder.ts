import { CronRunLogEntity } from '../../../contexts/booking/infrastructure/entities/cron-run-log.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class CronRunLogEntityBuilder {
  private tenantId = uuidv7();
  private cronDate = '2026-06-01';
  private reminderType = 'booking-reminder';
  private processedAt = new Date();

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCronDate(cronDate: string): this {
    this.cronDate = cronDate;
    return this;
  }

  withReminderType(reminderType: string): this {
    this.reminderType = reminderType;
    return this;
  }

  withProcessedAt(processedAt: Date): this {
    this.processedAt = processedAt;
    return this;
  }

  build(): CronRunLogEntity {
    const entity = new CronRunLogEntity();
    entity.tenantId = this.tenantId;
    entity.cronDate = this.cronDate;
    entity.reminderType = this.reminderType;
    entity.processedAt = this.processedAt;
    return entity;
  }
}
