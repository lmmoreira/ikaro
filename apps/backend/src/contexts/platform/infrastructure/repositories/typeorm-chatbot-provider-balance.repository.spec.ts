import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  ChatbotProviderBalanceBuilder,
  ChatbotProviderBalanceEntityBuilder,
} from '../../../../test/builders/platform';
import { ChatbotProviderBalance } from '../../domain/chatbot-provider-balance.aggregate';
import { ChatbotProviderBalanceEntity } from '../entities/chatbot-provider-balance.entity';
import { TypeOrmChatbotProviderBalanceRepository } from './typeorm-chatbot-provider-balance.repository';

const ENTITY = (): ChatbotProviderBalanceEntity =>
  new ChatbotProviderBalanceEntityBuilder()
    .withProvider('openrouter')
    .withRemainingUsd('18.4200')
    .build();

/** Chainable mock for `manager.createQueryBuilder().insert().into(...).values(...).orUpdate(...).execute()`
 * — recordCallOutcome()'s own conditional-overwrite upsert (never Repository.upsert(), unlike
 * saveBalance()), so it needs its own mock shape rather than mockRepo.upsert. */
function mockQueryBuilder() {
  const execute = jest.fn().mockResolvedValue({});
  const orUpdate = jest.fn().mockReturnValue({ execute });
  const values = jest.fn().mockReturnValue({ orUpdate });
  const into = jest.fn().mockReturnValue({ values });
  const insert = jest.fn().mockReturnValue({ into });
  const createQueryBuilder = jest.fn().mockReturnValue({ insert });
  return { createQueryBuilder, insert, into, values, orUpdate, execute };
}

describe('TypeOrmChatbotProviderBalanceRepository', () => {
  let mockRepo: jest.Mocked<Repository<ChatbotProviderBalanceEntity>>;
  let repo: TypeOrmChatbotProviderBalanceRepository;

  beforeEach(() => {
    mockRepo = {
      findOne: jest.fn(),
      upsert: jest.fn(),
      manager: mockQueryBuilder(),
    } as unknown as jest.Mocked<Repository<ChatbotProviderBalanceEntity>>;
    repo = new TypeOrmChatbotProviderBalanceRepository(mockRepo);
  });

  describe('findByProvider', () => {
    it('returns a ChatbotProviderBalance aggregate when found, converting the numeric string', async () => {
      mockRepo.findOne.mockResolvedValue(ENTITY());

      const result = await repo.findByProvider('openrouter');

      expect(result).toBeInstanceOf(ChatbotProviderBalance);
      expect(result!.provider).toBe('openrouter');
      expect(result!.remainingUsd!.toNumber()).toBe(18.42);
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { provider: 'openrouter' } });
    });

    it('preserves full NUMERIC(10,4) precision as a Decimal, not a lossy float', async () => {
      mockRepo.findOne.mockResolvedValue(
        new ChatbotProviderBalanceEntityBuilder()
          .withProvider('openrouter')
          .withRemainingUsd('18.4234')
          .build(),
      );

      const result = await repo.findByProvider('openrouter');

      expect(result!.remainingUsd!.toString()).toBe('18.4234');
    });

    it('returns null when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      expect(await repo.findByProvider('unknown')).toBeNull();
    });

    it('maps null remainingUsd/checkedAt to null on the domain object (health-only row, never polled)', async () => {
      mockRepo.findOne.mockResolvedValue(
        new ChatbotProviderBalanceEntityBuilder()
          .withProvider('anthropic')
          .withRemainingUsd(null)
          .withCheckedAt(null)
          .withLastSuccessAt(new Date('2026-08-12T10:00:00Z'))
          .build(),
      );

      const result = await repo.findByProvider('anthropic');

      expect(result!.remainingUsd).toBeNull();
      expect(result!.checkedAt).toBeNull();
      expect(result!.lastSuccessAt).toEqual(new Date('2026-08-12T10:00:00Z'));
    });

    it('maps a non-null lastFailureAt to a Date on the domain object', async () => {
      mockRepo.findOne.mockResolvedValue(
        new ChatbotProviderBalanceEntityBuilder()
          .withProvider('openrouter')
          .withLastFailureAt(new Date('2026-08-12T11:00:00Z'))
          .build(),
      );

      const result = await repo.findByProvider('openrouter');

      expect(result!.lastFailureAt).toEqual(new Date('2026-08-12T11:00:00Z'));
    });
  });

  describe('saveBalance', () => {
    it('upserts only provider/remainingUsd/checkedAt — never lastSuccessAt/lastFailureAt', async () => {
      const balance = new ChatbotProviderBalanceBuilder()
        .withProvider('openrouter')
        .withRemainingUsd(18.42)
        .build();

      await repo.saveBalance(balance);

      expect(mockRepo.upsert).toHaveBeenCalledTimes(1);
      const [savedEntity, conflictPaths] = mockRepo.upsert.mock.calls[0];
      expect((savedEntity as ChatbotProviderBalanceEntity).provider).toBe('openrouter');
      expect((savedEntity as ChatbotProviderBalanceEntity).remainingUsd).toBe('18.4200');
      // TypeORM's upsert() only includes a column in DO UPDATE SET when
      // typeof col.getEntityValue(entity) !== 'undefined' (verified against EntityManager.upsert()'s
      // own source) — a value of undefined is what excludes a column, not property presence.
      // TypeScript's useDefineForClassFields makes a declared-but-unassigned class field a real own
      // property (`in` sees it) whose *value* is still undefined, so assert on the value here.
      expect((savedEntity as ChatbotProviderBalanceEntity).lastSuccessAt).toBeUndefined();
      expect((savedEntity as ChatbotProviderBalanceEntity).lastFailureAt).toBeUndefined();
      expect(conflictPaths).toEqual(['provider']);
    });

    it('uses the active EntityManager when inside a transaction', async () => {
      const mockManager = { upsert: jest.fn().mockResolvedValue({}) } as unknown as EntityManager;
      const balance = new ChatbotProviderBalanceBuilder().withProvider('openrouter').build();

      await runWithEntityManager(mockManager, () => repo.saveBalance(balance));

      expect(mockManager.upsert).toHaveBeenCalledWith(
        ChatbotProviderBalanceEntity,
        expect.objectContaining({ provider: 'openrouter' }),
        ['provider'],
      );
      expect(mockRepo.upsert).not.toHaveBeenCalled();
    });
  });

  describe('recordCallOutcome', () => {
    it('upserts only provider/lastSuccessAt on a SUCCESS outcome, guarded so an older write can never clobber a newer one', async () => {
      const occurredAt = new Date('2026-08-12T10:00:00Z');

      await repo.recordCallOutcome('openrouter', 'SUCCESS', occurredAt);

      const qb = mockRepo.manager as unknown as ReturnType<typeof mockQueryBuilder>;
      expect(qb.values).toHaveBeenCalledWith({ provider: 'openrouter', lastSuccessAt: occurredAt });
      const [overwrite, conflictTarget, options] = qb.orUpdate.mock.calls[0] as [
        string[],
        string[],
        { overwriteCondition: { where: string } },
      ];
      expect(overwrite).toEqual(['last_success_at']);
      expect(conflictTarget).toEqual(['provider']);
      expect(options.overwriteCondition.where).toContain('last_success_at');
      expect(options.overwriteCondition.where).not.toContain('last_failure_at');
      expect(qb.execute).toHaveBeenCalledTimes(1);
      expect(mockRepo.upsert).not.toHaveBeenCalled();
    });

    it('upserts only provider/lastFailureAt on a FAILURE outcome, guarded so an older write can never clobber a newer one', async () => {
      const occurredAt = new Date('2026-08-12T10:05:00Z');

      await repo.recordCallOutcome('anthropic', 'FAILURE', occurredAt);

      const qb = mockRepo.manager as unknown as ReturnType<typeof mockQueryBuilder>;
      expect(qb.values).toHaveBeenCalledWith({ provider: 'anthropic', lastFailureAt: occurredAt });
      const [overwrite, conflictTarget, options] = qb.orUpdate.mock.calls[0] as [
        string[],
        string[],
        { overwriteCondition: { where: string } },
      ];
      expect(overwrite).toEqual(['last_failure_at']);
      expect(conflictTarget).toEqual(['provider']);
      expect(options.overwriteCondition.where).toContain('last_failure_at');
      expect(options.overwriteCondition.where).not.toContain('last_success_at');
    });

    it('uses the active EntityManager when inside a transaction', async () => {
      const qb = mockQueryBuilder();
      const mockManager = qb as unknown as EntityManager;

      await runWithEntityManager(mockManager, () =>
        repo.recordCallOutcome('openrouter', 'SUCCESS', new Date()),
      );

      expect(qb.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(
        (mockRepo.manager as unknown as ReturnType<typeof mockQueryBuilder>).createQueryBuilder,
      ).not.toHaveBeenCalled();
      expect(mockRepo.upsert).not.toHaveBeenCalled();
    });
  });
});
