import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository, SelectQueryBuilder } from 'typeorm';
import { drainDomainEvents } from '../../../../shared/infrastructure/outbox/drain-domain-events';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import { escapeLikePattern } from '../../../../shared/utils/escape-like-pattern';
import { Email } from '../../../../shared/value-objects/email.vo';
import { PhoneNumber } from '../../../../shared/value-objects/phone-number.vo';
import {
  ILeadFormSubmissionRepository,
  LeadFormSubmissionSearchOptions,
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
    await this.persistAnswers(submission, manager);
    // TD24-S02 pattern — 4th aggregate on the transactional-outbox pattern: drains events into
    // shared.outbox inside the same ambient transaction as the row above (docs/03-DOMAIN_EVENTS.md).
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
        WHERE tenant_id = $1 AND question_id = ANY($2::uuid[])
      `,
      [tenantId, questionIds],
    )) as Array<{ questionId: string }>;

    return rows.map((row) => row.questionId);
  }

  async deleteExpired(now: Date): Promise<number> {
    const manager = getActiveEntityManager();
    const executor = manager ?? this.repo.manager;

    // Child rows first (M20-S12) — no ON DELETE CASCADE on lead_form_answers (deliberately,
    // matching chatbot_messages/chatbot_sessions' own no-cascade precedent), so the parent delete
    // below would otherwise throw an FK-violation error on any expiring submission that has at
    // least one answered question. A single correlated statement, not a candidate-list-then-loop
    // (same reasoning ChatbotRetentionPurgeJob's own docstring gives for its sessionRepo delete).
    await executor.query(
      `
        DELETE FROM "platform"."lead_form_answers" a
        USING "platform"."lead_form_submissions" s
        WHERE a."tenant_id" = s."tenant_id"
          AND a."submission_id" = s."id"
          AND s."expires_at" < $1
      `,
      [now],
    );

    const result = await executor
      .createQueryBuilder()
      .delete()
      .from(LeadFormSubmissionEntity)
      .where('expires_at < :now', { now })
      .execute();
    return result.affected ?? 0;
  }

  async findDistinctQuestionLabels(tenantId: string): Promise<string[]> {
    const rows = (await this.repo.manager.query(
      `
        SELECT DISTINCT "question_label" AS "questionLabel"
        FROM "platform"."lead_form_answers"
        WHERE "tenant_id" = $1
        ORDER BY "questionLabel"
      `,
      [tenantId],
    )) as Array<{ questionLabel: string }>;
    return rows.map((row) => row.questionLabel);
  }

  async findByTenantPaginated(
    tenantId: string,
    page: number,
    pageSize: number,
    options?: LeadFormSubmissionSearchOptions,
  ): Promise<PaginatedLeadFormSubmissions> {
    const qb = this.repo
      .createQueryBuilder('submission')
      .where('submission.tenant_id = :tenantId', { tenantId });

    this.applySearch(qb, options?.search);
    this.applyFilters(qb, options?.filters);
    this.applyDateRange(qb, options?.submittedFrom, options?.submittedTo);

    // `id` (uuidv7, monotonically increasing) is a deterministic secondary sort key — two
    // submissions sharing the exact same submittedAt (plausible under concurrent traffic) would
    // otherwise have an undefined relative order across LIMIT/OFFSET page boundaries (CodeRabbit
    // review finding, PR #428).
    const [entities, total] = await qb
      .orderBy('submission.submitted_at', 'DESC')
      .addOrderBy('submission.id', 'DESC')
      .take(pageSize)
      .skip((page - 1) * pageSize)
      .getManyAndCount();

    return { items: entities.map((e) => this.toDomain(e)), total };
  }

  // Raw snake_case column/alias references throughout the three helpers below (not TypeORM's
  // camelCase property-path translation `sumCostUsdSince` uses for a single top-level condition)
  // — this query correlates the outer `submission` alias from inside nested EXISTS subqueries,
  // where relying on that translation firing consistently across the whole string is more
  // fragile than just writing the real, unambiguous column names everywhere.
  private applySearch(
    qb: SelectQueryBuilder<LeadFormSubmissionEntity>,
    search: string | undefined,
  ): void {
    if (!search) return;
    qb.andWhere(
      `(
        submission.name ILIKE :search
        OR submission.email ILIKE :search
        OR EXISTS (
          SELECT 1 FROM "platform"."lead_form_answers" a
          WHERE a."tenant_id" = submission.tenant_id
            AND a."submission_id" = submission.id
            AND (a."question_label" ILIKE :search OR a."answer_value" ILIKE :search)
        )
      )`,
      { search: `%${escapeLikePattern(search)}%` },
    );
  }

  private applyFilters(
    qb: SelectQueryBuilder<LeadFormSubmissionEntity>,
    filters: LeadFormSubmissionSearchOptions['filters'],
  ): void {
    filters?.forEach((filter, index) => {
      const labelParam = `filterLabel${index}`;
      const valueParam = `filterValue${index}`;
      const escapedValue = `%${escapeLikePattern(filter.value)}%`;
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM "platform"."lead_form_answers" a
          WHERE a."tenant_id" = submission.tenant_id
            AND a."submission_id" = submission.id
            AND a."question_label" = :${labelParam}
            AND a."answer_value" ILIKE :${valueParam}
        )`,
        { [labelParam]: filter.questionLabel, [valueParam]: escapedValue },
      );
    });
  }

  private applyDateRange(
    qb: SelectQueryBuilder<LeadFormSubmissionEntity>,
    submittedFrom: Date | undefined,
    submittedTo: Date | undefined,
  ): void {
    if (submittedFrom) {
      qb.andWhere('submission.submitted_at >= :submittedFrom', { submittedFrom });
    }
    if (submittedTo) {
      qb.andWhere('submission.submitted_at < :submittedTo', { submittedTo });
    }
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
        SELECT $1, $2, question_id FROM unnest($3::uuid[]) AS question_id
        ON CONFLICT DO NOTHING
      `,
      [submission.tenantId, submission.id, questionIds],
    );
  }

  // M20-S12 — one row per selected option (MULTIPLE_CHOICE's string[] flattened, TEXT/
  // SINGLE_CHOICE's single string wrapped), maintained in the same transaction as the parent
  // row. Never a second aggregate — purely a repository-owned search projection
  // (docs/13-DATABASE_SCHEMA.md § platform.lead_form_answers).
  private async persistAnswers(
    submission: LeadFormSubmission,
    manager: ReturnType<typeof getActiveEntityManager>,
  ): Promise<void> {
    const rows = submission.answers.flatMap((answer) => {
      const values = Array.isArray(answer.answerValue) ? answer.answerValue : [answer.answerValue];
      return values.map((value) => ({
        questionId: answer.questionId,
        questionLabel: answer.questionLabel,
        answerValue: value,
      }));
    });
    if (rows.length === 0) return;

    await (manager ?? this.repo.manager).query(
      `
        INSERT INTO "platform"."lead_form_answers"
          ("tenant_id", "submission_id", "question_id", "question_label", "answer_value")
        SELECT $1, $2, question_id, question_label, answer_value
        FROM unnest($3::uuid[], $4::text[], $5::text[])
          AS t(question_id, question_label, answer_value)
      `,
      [
        submission.tenantId,
        submission.id,
        rows.map((row) => row.questionId),
        rows.map((row) => row.questionLabel),
        rows.map((row) => row.answerValue),
      ],
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
