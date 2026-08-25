import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { drainDomainEvents } from '../../../../shared/infrastructure/outbox/drain-domain-events';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import { ILeadFormSubmissionRepository } from '../../application/ports/lead-form-submission-repository.port';
import { LeadFormSubmission } from '../../domain/lead-form-submission.aggregate';
import { LeadFormSubmissionEntity } from '../entities/lead-form-submission.entity';

@Injectable()
export class TypeOrmLeadFormSubmissionRepository implements ILeadFormSubmissionRepository {
  constructor(
    @InjectRepository(LeadFormSubmissionEntity)
    private readonly repo: Repository<LeadFormSubmissionEntity>,
    @Inject(OUTBOX_PUBLISHER)
    private readonly outboxPublisher: IOutboxPublisher,
  ) {}

  async save(submission: LeadFormSubmission): Promise<void> {
    const entity = this.toEntity(submission);
    const manager = getActiveEntityManager();
    if (manager) {
      await manager.save(LeadFormSubmissionEntity, entity);
    } else {
      await this.repo.save(entity);
    }
    // TD24-S02 pattern — this is the 4th aggregate to join the transactional-outbox pattern
    // (after Booking/Staff/Tenant): drains clearDomainEvents() into shared.outbox inside the
    // same ambient transaction as the row above (docs/03-DOMAIN_EVENTS.md § LeadFormSubmissionReceived).
    await drainDomainEvents(submission, this.outboxPublisher);
  }

  async countByTenantAndDate(tenantId: string, from: Date, to: Date): Promise<number> {
    return this.repo.count({
      where: { tenantId, submittedAt: Between(from, to) },
    });
  }

  async countByTenantIpAndDate(
    tenantId: string,
    ipAddress: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    return this.repo.count({
      where: { tenantId, ipAddress, submittedAt: Between(from, to) },
    });
  }

  async deleteExpired(now: Date): Promise<number> {
    const manager = getActiveEntityManager();
    const result = await (manager ?? this.repo.manager)
      .createQueryBuilder()
      .delete()
      .from(LeadFormSubmissionEntity)
      .where('expires_at < :now', { now })
      .execute();
    return result.affected ?? 0;
  }

  private toEntity(submission: LeadFormSubmission): LeadFormSubmissionEntity {
    const entity = new LeadFormSubmissionEntity();
    entity.id = submission.id;
    entity.tenantId = submission.tenantId;
    entity.customerId = submission.customerId;
    entity.name = submission.name;
    entity.email = submission.email.address;
    entity.phone = submission.phone.value;
    entity.answers = submission.answers;
    entity.submittedAt = submission.submittedAt;
    entity.expiresAt = submission.expiresAt;
    entity.ipAddress = submission.ipAddress;
    return entity;
  }
}
