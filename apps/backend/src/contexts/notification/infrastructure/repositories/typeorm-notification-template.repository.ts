import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  NotificationTemplate,
  NotificationChannel,
} from '../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { INotificationTemplateRepository } from '../../application/ports/notification-template-repository.port';
import { NotificationTemplateEntity } from '../entities/notification-template.entity';

@Injectable()
export class TypeOrmNotificationTemplateRepository implements INotificationTemplateRepository {
  constructor(
    @InjectRepository(NotificationTemplateEntity)
    private readonly repo: Repository<NotificationTemplateEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async findAllByTriggerEvent(
    tenantId: string,
    triggerEvent: NotificationTemplateKey,
  ): Promise<NotificationTemplate[]> {
    const entities = await this.repo.find({ where: { tenantId, triggerEvent } });
    return entities.map((e) => this.toDomain(e));
  }

  async findByTriggerEventAndChannel(
    tenantId: string,
    triggerEvent: NotificationTemplateKey,
    channel: string,
  ): Promise<NotificationTemplate | null> {
    const entity = await this.repo.findOne({ where: { tenantId, triggerEvent, channel } });
    return entity ? this.toDomain(entity) : null;
  }

  async findAllDefaults(): Promise<NotificationTemplate[]> {
    const entities = await this.repo.find({ where: { tenantId: IsNull() } });
    return entities.map((e) => this.toDomain(e));
  }

  async saveAll(templates: NotificationTemplate[]): Promise<void> {
    const manager = getActiveEntityManager();
    const entities = templates.map((t) => this.toEntity(t));
    if (manager) {
      await manager.save(NotificationTemplateEntity, entities);
    } else {
      await this.repo.save(entities);
    }
  }

  async copyGlobalDefaultsForTenant(tenantId: string, locale: string): Promise<number> {
    const result: { rowCount?: number } | null = await this.dataSource.query(
      `INSERT INTO notification.notification_templates
         (id, tenant_id, trigger_event, channel, locale, subject, body, created_at, updated_at)
       SELECT gen_random_uuid(), $1::uuid, trigger_event, channel, locale, subject, body, now(), now()
       FROM notification.notification_templates
       WHERE tenant_id IS NULL AND locale = $2
       ON CONFLICT DO NOTHING`,
      [tenantId, locale],
    );
    return result?.rowCount ?? 0;
  }

  private toDomain(entity: NotificationTemplateEntity): NotificationTemplate {
    return NotificationTemplate.reconstitute({
      id: entity.id,
      tenantId: entity.tenantId,
      triggerEvent: entity.triggerEvent,
      channel: entity.channel as NotificationChannel,
      locale: entity.locale,
      subject: entity.subject,
      body: entity.body,
      updatedAt: entity.updatedAt,
    });
  }

  private toEntity(template: NotificationTemplate): NotificationTemplateEntity {
    const entity = new NotificationTemplateEntity();
    entity.id = template.id;
    entity.tenantId = template.tenantId;
    entity.triggerEvent = template.triggerEvent;
    entity.channel = template.channel;
    entity.locale = template.locale;
    entity.subject = template.subject;
    entity.body = template.body;
    entity.createdAt = new Date();
    entity.updatedAt = template.updatedAt;
    return entity;
  }
}
