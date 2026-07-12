import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { SlugAlreadyTakenError } from '../../domain/errors/platform-domain.error';
import { Tenant } from '../../domain/tenant.aggregate';
import { TenantSettings } from '../../domain/value-objects/tenant-settings.vo';
import { TenantEntity } from '../entities/tenant.entity';
import { TypeOrmTenantRepository } from './typeorm-tenant.repository';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { TenantBuilder, TenantEntityBuilder } from '../../../../test/builders/platform';

describe('TypeOrmTenantRepository', () => {
  let mockRepo: jest.Mocked<Repository<TenantEntity>>;
  let repo: TypeOrmTenantRepository;

  beforeEach(() => {
    mockRepo = {
      findOne: jest.fn(),
      findBy: jest.fn(),
      save: jest.fn(),
      existsBy: jest.fn(),
    } as unknown as jest.Mocked<Repository<TenantEntity>>;
    repo = new TypeOrmTenantRepository(mockRepo, new InMemoryEventBus());
  });

  describe('findBySlug', () => {
    it('returns a Tenant aggregate when found', async () => {
      mockRepo.findOne.mockResolvedValue(new TenantEntityBuilder().build());

      const result = await repo.findBySlug('beloauto');

      expect(result).toBeInstanceOf(Tenant);
      expect(result!.id).toBe('tenant-id-1');
      expect(result!.slug.value).toBe('beloauto');
      expect(result!.name).toBe('BeloAuto');
      expect(result!.isActive).toBe(true);
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { slug: 'beloauto' } });
    });

    it('returns null when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      expect(await repo.findBySlug('nao-existe')).toBeNull();
    });

    it('reconstitutes TenantSettings from stored JSONB', async () => {
      mockRepo.findOne.mockResolvedValue(new TenantEntityBuilder().build());

      const result = await repo.findBySlug('beloauto');

      expect(result!.settings).toBeInstanceOf(TenantSettings);
      expect(result!.settings.loyalty.expiryDays).toBe(180);
      expect(result!.settings.businessHours.timezone).toBe('America/Sao_Paulo');
    });
  });

  describe('findById', () => {
    it('returns a Tenant aggregate when found', async () => {
      mockRepo.findOne.mockResolvedValue(new TenantEntityBuilder().build());

      const result = await repo.findById('tenant-id-1');

      expect(result).toBeInstanceOf(Tenant);
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 'tenant-id-1' } });
    });

    it('returns null when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      expect(await repo.findById('unknown')).toBeNull();
    });
  });

  describe('save', () => {
    it('maps domain aggregate to entity and persists via repo when no transaction is active', async () => {
      const tenant = new TenantBuilder().withSlug('novo-lavacar').withName('Novo Lavacar').build();
      mockRepo.save.mockResolvedValue({} as TenantEntity);

      await repo.save(tenant);

      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      const savedEntity = mockRepo.save.mock.calls[0][0] as TenantEntity;
      expect(savedEntity.id).toBe(tenant.id);
      expect(savedEntity.name).toBe('Novo Lavacar');
      expect(savedEntity.slug).toBe('novo-lavacar');
      expect(savedEntity.isActive).toBe(true);
      expect(savedEntity.settings).toEqual(tenant.settings.toJSON());
    });

    it('uses the active EntityManager when inside a transaction', async () => {
      const mockManager = {
        save: jest.fn().mockResolvedValue({}),
      } as unknown as EntityManager;
      const tenant = new TenantBuilder().withSlug('tx-tenant').build();

      await runWithEntityManager(mockManager, () => repo.save(tenant));

      expect(mockManager.save).toHaveBeenCalledWith(
        TenantEntity,
        expect.objectContaining({ id: tenant.id, slug: 'tx-tenant' }),
      );
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('maps pg 23505 unique violation to SlugAlreadyTakenError', async () => {
      const pgUniqueViolation = Object.assign(new QueryFailedError('', [], new Error()), {
        code: '23505',
      });
      mockRepo.save.mockRejectedValue(pgUniqueViolation);
      const tenant = new TenantBuilder().withSlug('dup-slug').build();

      await expect(repo.save(tenant)).rejects.toBeInstanceOf(SlugAlreadyTakenError);
    });

    it('re-throws non-unique-violation errors unchanged', async () => {
      const otherError = new Error('connection lost');
      mockRepo.save.mockRejectedValue(otherError);
      const tenant = new TenantBuilder().withSlug('any-slug').build();

      await expect(repo.save(tenant)).rejects.toThrow('connection lost');
    });
  });

  describe('findByIds', () => {
    it('returns an empty array for an empty ids list', async () => {
      expect(await repo.findByIds([])).toEqual([]);
      expect(mockRepo.findBy).not.toHaveBeenCalled();
    });

    it('returns Tenant aggregates for each matching id', async () => {
      const entityA = new TenantEntityBuilder().withId('id-a').withSlug('slug-a').build();
      const entityB = new TenantEntityBuilder().withId('id-b').withSlug('slug-b').build();
      mockRepo.findBy.mockResolvedValue([entityA, entityB]);

      const results = await repo.findByIds(['id-a', 'id-b']);

      expect(results).toHaveLength(2);
      expect(results.map((t) => t.id)).toEqual(expect.arrayContaining(['id-a', 'id-b']));
    });

    it('returns an empty array when no ids match', async () => {
      mockRepo.findBy.mockResolvedValue([]);

      const results = await repo.findByIds(['no-such-id']);

      expect(results).toEqual([]);
    });
  });

  describe('existsBySlug', () => {
    it('returns true when slug exists', async () => {
      mockRepo.existsBy.mockResolvedValue(true);
      expect(await repo.existsBySlug('beloauto')).toBe(true);
      expect(mockRepo.existsBy).toHaveBeenCalledWith({ slug: 'beloauto' });
    });

    it('returns false when slug does not exist', async () => {
      mockRepo.existsBy.mockResolvedValue(false);
      expect(await repo.existsBySlug('nao-existe')).toBe(false);
    });
  });
});
