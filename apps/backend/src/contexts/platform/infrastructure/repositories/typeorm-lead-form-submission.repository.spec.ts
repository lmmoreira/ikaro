import { Between, EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { LeadFormSubmissionBuilder } from '../../../../test/builders/platform/lead-form-submission.builder';
import { LeadFormSubmission } from '../../domain/lead-form-submission.aggregate';
import { LeadFormSubmissionEntity } from '../entities/lead-form-submission.entity';
import { TypeOrmLeadFormSubmissionRepository } from './typeorm-lead-form-submission.repository';

describe('TypeOrmLeadFormSubmissionRepository', () => {
  let mockRepo: jest.Mocked<Repository<LeadFormSubmissionEntity>>;
  let outboxPublisher: InMemoryEventBus;
  let repo: TypeOrmLeadFormSubmissionRepository;

  beforeEach(() => {
    mockRepo = {
      save: jest.fn(),
      count: jest.fn(),
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
});
