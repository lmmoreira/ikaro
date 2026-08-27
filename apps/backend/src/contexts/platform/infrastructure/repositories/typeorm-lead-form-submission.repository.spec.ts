import { Between, EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { LeadFormSubmissionBuilder } from '../../../../test/builders/platform/lead-form-submission.builder';
import { LeadFormSubmissionEntityBuilder } from '../../../../test/builders/platform/lead-form-submission-entity.builder';
import { LeadFormSubmission } from '../../domain/lead-form-submission.aggregate';
import { LeadFormSubmissionEntity } from '../entities/lead-form-submission.entity';
import { TypeOrmLeadFormSubmissionRepository } from './typeorm-lead-form-submission.repository';

// Chainable delete-query-builder fake — each method returns the same object except the
// terminal execute() call, matching TypeORM's own fluent DeleteQueryBuilder API surface
// (mirrors typeorm-chatbot-message.repository.spec.ts's own deleteOlderThan coverage).
function makeDeleteQueryBuilder(affected: number): {
  delete: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  execute: jest.Mock;
} {
  const qb = {
    delete: jest.fn(),
    from: jest.fn(),
    where: jest.fn(),
    execute: jest.fn().mockResolvedValue({ affected }),
  };
  qb.delete.mockReturnValue(qb);
  qb.from.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  return qb;
}

// Chainable select-query-builder fake for findByTenantPaginated (M20-S12) — same fluent-mock
// shape as makeDeleteQueryBuilder above, sized to the methods that repository method actually
// calls: where/andWhere (search, filters, date range), orderBy/addOrderBy, take/skip,
// getManyAndCount.
function makeSelectQueryBuilder(
  entities: LeadFormSubmissionEntity[],
  total: number,
): {
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  take: jest.Mock;
  skip: jest.Mock;
  getManyAndCount: jest.Mock;
} {
  const qb = {
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    take: jest.fn(),
    skip: jest.fn(),
    getManyAndCount: jest.fn().mockResolvedValue([entities, total]),
  };
  qb.where.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  qb.orderBy.mockReturnValue(qb);
  qb.addOrderBy.mockReturnValue(qb);
  qb.take.mockReturnValue(qb);
  qb.skip.mockReturnValue(qb);
  return qb;
}

describe('TypeOrmLeadFormSubmissionRepository', () => {
  let mockRepo: jest.Mocked<Repository<LeadFormSubmissionEntity>>;
  let outboxPublisher: InMemoryEventBus;
  let repo: TypeOrmLeadFormSubmissionRepository;

  beforeEach(() => {
    mockRepo = {
      save: jest.fn(),
      count: jest.fn(),
      query: jest.fn(),
      createQueryBuilder: jest.fn(),
      manager: { createQueryBuilder: jest.fn(), query: jest.fn().mockResolvedValue(undefined) },
    } as unknown as jest.Mocked<Repository<LeadFormSubmissionEntity>>;
    outboxPublisher = new InMemoryEventBus();
    repo = new TypeOrmLeadFormSubmissionRepository(mockRepo, outboxPublisher);
  });

  describe('save', () => {
    it('maps the aggregate to an entity and persists via repo when no transaction is active', async () => {
      const submission = LeadFormSubmission.create({
        tenantId: 'tenant-id-1',
        customerId: null,
        name: 'Maria Silva',
        email: 'maria@example.com',
        phone: '+5511912345678',
        answers: [],
        ipAddress: '203.0.113.10',
        retentionMonths: 6,
        correlationId: 'corr-1',
      });
      mockRepo.save.mockResolvedValue({} as LeadFormSubmissionEntity);

      await repo.save(submission);

      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      const savedEntity = mockRepo.save.mock.calls[0][0] as LeadFormSubmissionEntity;
      expect(savedEntity.id).toBe(submission.id);
      expect(savedEntity.tenantId).toBe('tenant-id-1');
      expect(savedEntity.customerId).toBeNull();
      expect(savedEntity.name).toBe('Maria Silva');
      expect(savedEntity.email).toBe('maria@example.com');
      expect(savedEntity.phone).toBe('+5511912345678');
      expect(savedEntity.ipAddress).toBe('203.0.113.10');
    });

    it('uses the active EntityManager when inside a transaction', async () => {
      const mockManager = { save: jest.fn().mockResolvedValue({}) } as unknown as EntityManager;
      const submission = new LeadFormSubmissionBuilder().withTenantId('tenant-id-1').build();

      await runWithEntityManager(mockManager, () => repo.save(submission));

      expect(mockManager.save).toHaveBeenCalledWith(
        LeadFormSubmissionEntity,
        expect.objectContaining({ id: submission.id, tenantId: 'tenant-id-1' }),
      );
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('drains the aggregate domain events into the outbox publisher', async () => {
      const submission = LeadFormSubmission.create({
        tenantId: 'tenant-id-1',
        customerId: null,
        name: 'Maria Silva',
        email: 'maria@example.com',
        phone: '+5511912345678',
        answers: [],
        ipAddress: '203.0.113.10',
        retentionMonths: 6,
        correlationId: 'corr-1',
      });
      mockRepo.save.mockResolvedValue({} as LeadFormSubmissionEntity);

      await repo.save(submission);

      expect(outboxPublisher.publishCallCount).toBe(1);
      expect(submission.domainEvents).toHaveLength(0);
    });

    it('drains no events for a reconstituted submission (no pending domain events)', async () => {
      const submission = new LeadFormSubmissionBuilder().build();
      mockRepo.save.mockResolvedValue({} as LeadFormSubmissionEntity);

      await repo.save(submission);

      expect(outboxPublisher.publishCallCount).toBe(0);
    });

    it('persistAnswers flattens a MULTIPLE_CHOICE answer into one row per selected option (M20-S12)', async () => {
      const submission = new LeadFormSubmissionBuilder()
        .withAnswers([
          {
            questionId: '01234567-0000-7000-8000-000000000101',
            questionLabel: 'Serviços de interesse',
            questionType: 'MULTIPLE_CHOICE',
            answerValue: ['Lavagem', 'Enceramento'],
          },
        ])
        .build();
      mockRepo.save.mockResolvedValue({} as LeadFormSubmissionEntity);

      await repo.save(submission);

      expect(mockRepo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('lead_form_answers'),
        [
          submission.tenantId,
          submission.id,
          ['01234567-0000-7000-8000-000000000101', '01234567-0000-7000-8000-000000000101'],
          ['Serviços de interesse', 'Serviços de interesse'],
          ['Lavagem', 'Enceramento'],
        ],
      );
    });

    it('persistAnswers is skipped (no lead_form_answers query) when the submission has no answers', async () => {
      const submission = new LeadFormSubmissionBuilder().withAnswers([]).build();
      mockRepo.save.mockResolvedValue({} as LeadFormSubmissionEntity);

      await repo.save(submission);

      expect(mockRepo.manager.query).not.toHaveBeenCalledWith(
        expect.stringContaining('lead_form_answers'),
        expect.anything(),
      );
    });
  });

  describe('countByTenantAndDate', () => {
    it('counts scoped by tenant, filtered by the given real UTC instant range', async () => {
      mockRepo.count.mockResolvedValue(3);
      const from = new Date('2026-06-01T00:00:00.000Z');
      const to = new Date('2026-06-01T23:59:59.999Z');

      const result = await repo.countByTenantAndDate('tenant-id-1', from, to);

      expect(result).toBe(3);
      expect(mockRepo.count).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-id-1', submittedAt: Between(from, to) },
      });
    });
  });

  describe('countByTenantIpAndDate', () => {
    it('counts scoped by tenant, ip, filtered by the given real UTC instant range', async () => {
      mockRepo.count.mockResolvedValue(1);
      const from = new Date('2026-06-01T00:00:00.000Z');
      const to = new Date('2026-06-01T23:59:59.999Z');

      const result = await repo.countByTenantIpAndDate('tenant-id-1', '203.0.113.10', from, to);

      expect(result).toBe(1);
      expect(mockRepo.count).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-id-1',
          ipAddress: '203.0.113.10',
          submittedAt: Between(from, to),
        },
      });
    });
  });

  describe('deleteExpired', () => {
    const now = new Date('2026-08-25T03:00:00.000Z');

    it('deletes via repo.manager.createQueryBuilder() when no transaction is active', async () => {
      const qb = makeDeleteQueryBuilder(4);
      (mockRepo.manager.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await repo.deleteExpired(now);

      expect(qb.from).toHaveBeenCalledWith(LeadFormSubmissionEntity);
      expect(qb.where).toHaveBeenCalledWith('expires_at < :now', { now });
      expect(result).toBe(4);
    });

    // M20-S12: lead_form_answers has no ON DELETE CASCADE — the child rows for an expiring
    // submission must be deleted first, in the same executor (manager or repo.manager), before
    // the parent delete below runs.
    it('deletes lead_form_answers rows for expiring submissions before deleting the parent rows', async () => {
      const qb = makeDeleteQueryBuilder(4);
      (mockRepo.manager.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      await repo.deleteExpired(now);

      expect(mockRepo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('lead_form_answers'),
        [now],
      );
      expect(mockRepo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('lead_form_submissions'),
        [now],
      );
      // Both deletes ran: the child rows via the raw query above, the parent row via the
      // existing createQueryBuilder delete (already asserted in the sibling test above).
      expect(qb.execute).toHaveBeenCalled();
    });

    it('returns 0 when execute() reports no affected rows', async () => {
      const qb = makeDeleteQueryBuilder(0);
      qb.execute.mockResolvedValue({ affected: null });
      (mockRepo.manager.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      expect(await repo.deleteExpired(now)).toBe(0);
    });

    it('uses the active EntityManager when inside a transaction', async () => {
      const qb = makeDeleteQueryBuilder(2);
      const mockManager = {
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        query: jest.fn().mockResolvedValue(undefined),
      } as unknown as EntityManager;

      const result = await runWithEntityManager(mockManager, () => repo.deleteExpired(now));

      expect(mockManager.createQueryBuilder).toHaveBeenCalled();
      expect(mockManager.query).toHaveBeenCalled();
      expect(mockRepo.manager.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockRepo.manager.query).not.toHaveBeenCalled();
      expect(result).toBe(2);
    });
  });

  describe('findDistinctQuestionLabels', () => {
    it('queries lead_form_answers scoped to the tenant, ordered by label', async () => {
      mockRepo.manager.query = jest
        .fn()
        .mockResolvedValue([{ questionLabel: 'Estado civil' }, { questionLabel: 'Onde mora' }]);

      const result = await repo.findDistinctQuestionLabels('tenant-id-1');

      expect(result).toEqual(['Estado civil', 'Onde mora']);
      expect(mockRepo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('lead_form_answers'),
        ['tenant-id-1'],
      );
    });
  });

  describe('findQuestionIdsWithSubmissions', () => {
    it('returns distinct question IDs scoped to the tenant', async () => {
      mockRepo.query.mockResolvedValue([{ questionId: 'question-1' }]);

      const result = await repo.findQuestionIdsWithSubmissions('tenant-id-1', [
        'question-1',
        'question-2',
      ]);

      expect(result).toEqual(['question-1']);
      expect(mockRepo.query).toHaveBeenCalledWith(expect.stringContaining('tenant_id = $1'), [
        'tenant-id-1',
        ['question-1', 'question-2'],
      ]);
      expect(mockRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('lead_form_submission_question_refs'),
        ['tenant-id-1', ['question-1', 'question-2']],
      );
    });

    it('does not query when there are no question IDs', async () => {
      await expect(repo.findQuestionIdsWithSubmissions('tenant-id-1', [])).resolves.toEqual([]);
      expect(mockRepo.query).not.toHaveBeenCalled();
    });
  });

  describe('findByTenantPaginated (M20-S12 — query-builder branch coverage)', () => {
    const entity = new LeadFormSubmissionEntityBuilder().withTenantId('tenant-id-1').build();

    it('applies only the tenant filter and pagination when no options are given', async () => {
      const qb = makeSelectQueryBuilder([entity], 1);
      mockRepo.createQueryBuilder.mockReturnValue(qb as never);

      const result = await repo.findByTenantPaginated('tenant-id-1', 1, 20);

      expect(mockRepo.createQueryBuilder).toHaveBeenCalledWith('submission');
      expect(qb.where).toHaveBeenCalledWith('submission.tenant_id = :tenantId', {
        tenantId: 'tenant-id-1',
      });
      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(qb.orderBy).toHaveBeenCalledWith('submission.submitted_at', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('submission.id', 'DESC');
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('applies the search EXISTS clause when search is given', async () => {
      const qb = makeSelectQueryBuilder([], 0);
      mockRepo.createQueryBuilder.mockReturnValue(qb as never);

      await repo.findByTenantPaginated('tenant-id-1', 1, 20, { search: 'casado' });

      expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('lead_form_answers'), {
        search: '%casado%',
      });
    });

    // A literal `%`/`_`/`\` in the caller's own search term is also a LIKE/ILIKE wildcard to
    // Postgres — unescaped, `%%%` would pass the 3-character length guard while matching
    // everything and using no trigram index (Codex review finding, PR #434 round 3).
    it('escapes literal %, _, and \\ in search before wrapping it as a contains-pattern', async () => {
      const qb = makeSelectQueryBuilder([], 0);
      mockRepo.createQueryBuilder.mockReturnValue(qb as never);

      await repo.findByTenantPaginated('tenant-id-1', 1, 20, { search: '%_\\test' });

      expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('lead_form_answers'), {
        search: '%\\%\\_\\\\test%',
      });
    });

    it('applies one EXISTS clause per filter entry, each independently parameterized', async () => {
      const qb = makeSelectQueryBuilder([], 0);
      mockRepo.createQueryBuilder.mockReturnValue(qb as never);

      await repo.findByTenantPaginated('tenant-id-1', 1, 20, {
        filters: [
          { questionLabel: 'Estado civil', value: 'casado' },
          { questionLabel: 'Onde mora', value: 'paulo' },
        ],
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('"question_label" = :filterLabel0'),
        {
          filterLabel0: 'Estado civil',
          filterValue0: '%casado%',
        },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('"question_label" = :filterLabel1'),
        {
          filterLabel1: 'Onde mora',
          filterValue1: '%paulo%',
        },
      );
    });

    it('applies submittedFrom and submittedTo as separate andWhere clauses', async () => {
      const qb = makeSelectQueryBuilder([], 0);
      mockRepo.createQueryBuilder.mockReturnValue(qb as never);
      const submittedFrom = new Date('2026-03-01T00:00:00.000Z');
      const submittedTo = new Date('2026-04-01T00:00:00.000Z');

      await repo.findByTenantPaginated('tenant-id-1', 1, 20, { submittedFrom, submittedTo });

      expect(qb.andWhere).toHaveBeenCalledWith('submission.submitted_at >= :submittedFrom', {
        submittedFrom,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('submission.submitted_at < :submittedTo', {
        submittedTo,
      });
    });

    it('applies only submittedFrom when submittedTo is omitted', async () => {
      const qb = makeSelectQueryBuilder([], 0);
      mockRepo.createQueryBuilder.mockReturnValue(qb as never);
      const submittedFrom = new Date('2026-03-01T00:00:00.000Z');

      await repo.findByTenantPaginated('tenant-id-1', 1, 20, { submittedFrom });

      expect(qb.andWhere).toHaveBeenCalledWith('submission.submitted_at >= :submittedFrom', {
        submittedFrom,
      });
      expect(qb.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('submitted_at <'),
        expect.anything(),
      );
    });

    it('computes skip from page and pageSize', async () => {
      const qb = makeSelectQueryBuilder([], 0);
      mockRepo.createQueryBuilder.mockReturnValue(qb as never);

      await repo.findByTenantPaginated('tenant-id-1', 3, 10);

      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(10);
    });
  });
});
