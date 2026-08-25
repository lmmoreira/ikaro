import { Between, EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { LeadFormSubmissionBuilder } from '../../../../test/builders/platform/lead-form-submission.builder';
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

describe('TypeOrmLeadFormSubmissionRepository', () => {
  let mockRepo: jest.Mocked<Repository<LeadFormSubmissionEntity>>;
  let outboxPublisher: InMemoryEventBus;
  let repo: TypeOrmLeadFormSubmissionRepository;

  beforeEach(() => {
    mockRepo = {
      save: jest.fn(),
      count: jest.fn(),
      query: jest.fn(),
      manager: { createQueryBuilder: jest.fn() },
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
      } as unknown as EntityManager;

      const result = await runWithEntityManager(mockManager, () => repo.deleteExpired(now));

      expect(mockManager.createQueryBuilder).toHaveBeenCalled();
      expect(mockRepo.manager.createQueryBuilder).not.toHaveBeenCalled();
      expect(result).toBe(2);
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
    });

    it('does not query when there are no question IDs', async () => {
      await expect(repo.findQuestionIdsWithSubmissions('tenant-id-1', [])).resolves.toEqual([]);
      expect(mockRepo.query).not.toHaveBeenCalled();
    });
  });
});
