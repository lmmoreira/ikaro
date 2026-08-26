import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { drainDomainEvents } from '../../../../shared/infrastructure/outbox/drain-domain-events';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import { Email } from '../../../../shared/value-objects/email.vo';
import { PhoneNumber } from '../../../../shared/value-objects/phone-number.vo';
import {
  ILeadFormSubmissionRepository,
  PaginatedLeadFormSubmissions,
} from '../../application/ports/lead-form-submission-repository.port';
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
    await this.persistQuestionRefs(submission, manager);
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

  async findQuestionIdsWithSubmissions(
    tenantId: string,
    questionIds: readonly string[],
  ): Promise<readonly string[]> {
    if (questionIds.length === 0) return [];

    const rows = (await this.repo.query(
      `
        SELECT DISTINCT question_id AS "questionId"
        FROM platform.lead_form_submission_question_refs
        WHERE tenant_id = $1 AND question_id = ANY($2::text[])
      `,
      [tenantId, questionIds],
    )) as Array<{ questionId: string }>;

    return rows.map((row) => row.questionId);
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

  async findByTenantPaginated(
    tenantId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedLeadFormSubmissions> {
    // `id` (uuidv7, monotonically increasing) is a deterministic secondary sort key — two
    // submissions sharing the exact same submittedAt (plausible under concurrent traffic) would
    // otherwise have an undefined relative order across LIMIT/OFFSET page boundaries (CodeRabbit
    // review finding, PR #428).
    const [entities, total] = await this.repo.findAndCount({
      where: { tenantId },
      order: { submittedAt: 'DESC', id: 'DESC' },
      take: pageSize,
      skip: (page - 1) * pageSize,
    });
    return { items: entities.map((e) => this.toDomain(e)), total };
  }

  async findById(id: string, tenantId: string): Promise<LeadFormSubmission | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  private toDomain(entity: LeadFormSubmissionEntity): LeadFormSubmission {
    return LeadFormSubmission.reconstitute({
      id: entity.id,
      tenantId: entity.tenantId,
      customerId: entity.customerId,
      name: entity.name,
      email: Email.reconstitute(entity.email),
      phone: PhoneNumber.reconstitute(entity.phone),
      answers: entity.answers,
      submittedAt: entity.submittedAt,
      expiresAt: entity.expiresAt,
      ipAddress: entity.ipAddress,
    });
  }

  private async persistQuestionRefs(
    submission: LeadFormSubmission,
    manager: ReturnType<typeof getActiveEntityManager>,
  ): Promise<void> {
    const questionIds = [...new Set(submission.answers.map((answer) => answer.questionId))];
    if (questionIds.length === 0) return;
    await (manager ?? this.repo.manager).query(
      `
        INSERT INTO platform.lead_form_submission_question_refs
          (tenant_id, submission_id, question_id)
        SELECT $1, $2, question_id FROM unnest($3::text[]) AS question_id
        ON CONFLICT DO NOTHING
      `,
      [submission.tenantId, submission.id, questionIds],
    );
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
