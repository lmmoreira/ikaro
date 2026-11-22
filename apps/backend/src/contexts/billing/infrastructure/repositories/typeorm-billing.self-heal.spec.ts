import { EntityManager, MoreThan, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { InMemoryCachePort } from '../../../../test/infrastructure/in-memory-cache.port';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { ProviderEventEntity } from '../entities/provider-event.entity';
import { SignupRegistrationEntity } from '../entities/signup-registration.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { CachingSubscriptionRepository } from './caching-subscription.repository';
import { TypeOrmProviderEventRepository } from './typeorm-provider-event.repository';
import { TypeOrmSignupRegistrationRepository } from './typeorm-signup-registration.repository';
import { TypeOrmSubscriptionRepository } from './typeorm-subscription.repository';

// The adapters' SQL contract for the self-heal reads and writes (UC-140), pinned without a
// database; the round trip against Postgres is `typeorm-billing.self-heal.integration.spec.ts`.
describe('Billing self-heal repository adapters', () => {
  describe('TypeOrmProviderEventRepository.existsProcessedAfter', () => {
    it('asks for a delivery of the provider received strictly after the instant', async () => {
      const manager = {
        exists: jest.fn().mockResolvedValue(true),
      } as unknown as jest.Mocked<EntityManager>;
      const repo = new TypeOrmProviderEventRepository({
        manager,
      } as unknown as Repository<ProviderEventEntity>);
      const since = new Date('2026-03-10T15:00:00Z');

      await expect(repo.existsProcessedAfter('ASAAS', since)).resolves.toBe(true);

      expect(manager.exists).toHaveBeenCalledWith(ProviderEventEntity, {
        where: { provider: 'ASAAS', receivedAt: MoreThan(since) },
      });
    });

    it("joins the caller's transaction when there is one", async () => {
      const own = { exists: jest.fn() } as unknown as jest.Mocked<EntityManager>;
      const tx = {
        exists: jest.fn().mockResolvedValue(false),
      } as unknown as jest.Mocked<EntityManager>;
      const repo = new TypeOrmProviderEventRepository({
        manager: own,
      } as unknown as Repository<ProviderEventEntity>);

      await runWithEntityManager(tx, () => repo.existsProcessedAfter('STRIPE', new Date()));

      expect(tx.exists).toHaveBeenCalledTimes(1);
      expect(own.exists).not.toHaveBeenCalled();
    });
  });

  describe('TypeOrmSignupRegistrationRepository.releaseExpiredReservations', () => {
    it('deletes only RESERVED rows created before the cutoff and returns how many', async () => {
      const manager = {
        delete: jest.fn().mockResolvedValue({ affected: 3 }),
      } as unknown as jest.Mocked<EntityManager>;
      const repo = new TypeOrmSignupRegistrationRepository({
        manager,
      } as unknown as Repository<SignupRegistrationEntity>);
      const cutoff = new Date('2026-03-10T14:00:00Z');

      await expect(repo.releaseExpiredReservations(cutoff)).resolves.toBe(3);

      const [entity, criteria] = manager.delete.mock.calls[0] as [
        unknown,
        { status: string; createdAt: { value: Date } },
      ];
      expect(entity).toBe(SignupRegistrationEntity);
      expect(criteria.status).toBe('RESERVED');
      expect(criteria.createdAt.value).toEqual(cutoff);
    });

    it('answers 0 when the driver reports no affected count', async () => {
      const manager = {
        delete: jest.fn().mockResolvedValue({}),
      } as unknown as jest.Mocked<EntityManager>;
      const repo = new TypeOrmSignupRegistrationRepository({
        manager,
      } as unknown as Repository<SignupRegistrationEntity>);

      await expect(repo.releaseExpiredReservations(new Date())).resolves.toBe(0);
    });
  });

  describe('TypeOrmSubscriptionRepository.findExistingTenantIds', () => {
    const repoWith = (rows: { tenantId: string }[]) => {
      const where = jest.fn();
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.where = (...args: unknown[]) => {
        where(...args);
        return builder;
      };
      builder.getRawMany = jest.fn().mockResolvedValue(rows);
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue(builder),
      } as unknown as jest.Mocked<EntityManager>;
      const repo = new TypeOrmSubscriptionRepository(
        { manager } as unknown as Repository<SubscriptionEntity>,
        new InMemoryOutboxPublisher(),
      );
      return { repo, manager, where };
    };

    it('selects the asked tenant ids that have a subscription, by an IN over tenant_id', async () => {
      const { repo, where } = repoWith([{ tenantId: 't-1' }]);

      await expect(repo.findExistingTenantIds(['t-1', 't-2'])).resolves.toEqual(['t-1']);

      expect(where).toHaveBeenCalledWith('s.tenantId IN (:...tenantIds)', {
        tenantIds: ['t-1', 't-2'],
      });
    });

    it('answers empty without a query when no id is asked for', async () => {
      const { repo, manager } = repoWith([]);

      await expect(repo.findExistingTenantIds([])).resolves.toEqual([]);

      expect(manager.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('CachingSubscriptionRepository.findExistingTenantIds', () => {
    it('forwards to the repository, uncached', async () => {
      const inner = new InMemorySubscriptionRepository();
      const spy = jest.spyOn(inner, 'findExistingTenantIds').mockResolvedValue(['t-1']);
      const cache = new InMemoryCachePort();
      const repo = new CachingSubscriptionRepository(inner, cache);

      await expect(repo.findExistingTenantIds(['t-1'])).resolves.toEqual(['t-1']);

      expect(spy).toHaveBeenCalledWith(['t-1']);
      expect(cache.getCalls).toHaveLength(0);
    });
  });
});
