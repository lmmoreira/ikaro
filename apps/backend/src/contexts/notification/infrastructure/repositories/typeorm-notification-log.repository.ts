import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { INotificationLogRepository } from '../../application/ports/notification-log-repository.port';
import { NotificationLog } from '../../domain/notification-log.aggregate';
import { NotificationLogEntity } from '../entities/notification-log.entity';

const UPSERT_SQL = `
  INSERT INTO "notification"."notification_logs"
    ("id","tenant_id","event_id","notification_type","channel",
     "recipient_email","status","retry_count","error_message","sent_at","created_at")
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  ON CONFLICT ("tenant_id","event_id","notification_type","channel")
  DO UPDATE SET
    "status"        = EXCLUDED."status",
    "retry_count"   = CASE
                        WHEN EXCLUDED."status" = 'FAILED'
                        THEN "notification_logs"."retry_count" + 1
                        ELSE "notification_logs"."retry_count"
                      END,
    "error_message" = EXCLUDED."error_message",
    "sent_at"       = EXCLUDED."sent_at"
`;

@Injectable()
export class TypeOrmNotificationLogRepository implements INotificationLogRepository {
  constructor(
    @InjectRepository(NotificationLogEntity)
    private readonly repo: Repository<NotificationLogEntity>,
  ) {}

  async save(log: NotificationLog): Promise<void> {
    const manager = getActiveEntityManager();
    const entity = this.toEntity(log);
    const params = [
      entity.id,
      entity.tenantId,
      entity.eventId,
      entity.notificationType,
      entity.channel,
      entity.recipientEmail,
      entity.status,
      entity.retryCount,
      entity.errorMessage,
      entity.sentAt,
      entity.createdAt,
    ];
    if (manager) {
      await manager.query(UPSERT_SQL, params);
    } else {
      await this.repo.query(UPSERT_SQL, params);
    }
  }

  private toEntity(log: NotificationLog): NotificationLogEntity {
    const entity = new NotificationLogEntity();
    entity.id = log.id;
    entity.tenantId = log.tenantId;
    entity.eventId = log.eventId;
    entity.notificationType = log.notificationType;
    entity.channel = log.channel;
    entity.recipientEmail = log.recipientEmail.address;
    entity.status = log.status;
    entity.retryCount = log.retryCount;
    entity.errorMessage = log.errorMessage ?? null;
    entity.sentAt = log.sentAt ?? null;
    entity.createdAt = log.createdAt;
    return entity;
  }
}
