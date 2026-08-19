import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { DEFAULT_HOTSITE_BRANDING, HotsiteConfig } from '../../domain/hotsite-config.aggregate';
import { HotsiteConfigConcurrentModificationError } from '../../domain/errors/platform-domain.error';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { TypeOrmHotsiteConfigRepository } from './typeorm-hotsite-config.repository';
import {
  HotsiteConfigBuilder,
  HotsiteConfigEntityBuilder,
} from '../../../../test/builders/platform';

describe('TypeOrmHotsiteConfigRepository', () => {
  let mockRepo: jest.Mocked<Repository<HotsiteConfigEntity>>;
  let repo: TypeOrmHotsiteConfigRepository;
  let mockUpdateBuilder: {
    update: jest.Mock;
    set: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    execute: jest.Mock;
  };
  let mockManager: {
    insert: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  beforeEach(() => {
    mockUpdateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    mockManager = {
      insert: jest.fn().mockResolvedValue({}),
      createQueryBuilder: jest.fn().mockReturnValue(mockUpdateBuilder),
    };
    mockRepo = {
      findOne: jest.fn(),
      findBy: jest.fn(),
      save: jest.fn(),
      manager: mockManager,
    } as unknown as jest.Mocked<Repository<HotsiteConfigEntity>>;
    repo = new TypeOrmHotsiteConfigRepository(mockRepo);
  });

  describe('findByTenantId', () => {
    it('returns a HotsiteConfig aggregate when found', async () => {
      const entity = new HotsiteConfigEntityBuilder().build();
      mockRepo.findOne.mockResolvedValue(entity);

      const result = await repo.findByTenantId('tenant-id-1');

      expect(result).toBeInstanceOf(HotsiteConfig);
      expect(result!.id).toBe(entity.id);
      expect(result!.tenantId).toBe('tenant-id-1');
      expect(result!.isPublished).toBe(false);
      expect(result!.branding).toEqual(DEFAULT_HOTSITE_BRANDING);
      expect(result!.layout).toHaveLength(1);
      expect(result!.version).toBe(1);
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { tenantId: 'tenant-id-1' } });
    });

    it('returns null when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      expect(await repo.findByTenantId('unknown-tenant')).toBeNull();
    });

    it('correctly maps isPublished = true', async () => {
      mockRepo.findOne.mockResolvedValue(
        new HotsiteConfigEntityBuilder().withIsPublished(true).build(),
      );

      const result = await repo.findByTenantId('tenant-id-1');
      expect(result!.isPublished).toBe(true);
    });
  });

  describe('findByTenantIds', () => {
    it('returns an empty array for an empty tenant id list', async () => {
      expect(await repo.findByTenantIds([])).toEqual([]);
      expect(mockRepo.findBy).not.toHaveBeenCalled();
    });

    it('returns HotsiteConfig aggregates for each matching tenant id', async () => {
      const entityA = new HotsiteConfigEntityBuilder()
        .withId('config-a')
        .withTenantId('tenant-a')
        .build();
      const entityB = new HotsiteConfigEntityBuilder()
        .withId('config-b')
        .withTenantId('tenant-b')
        .build();
      mockRepo.findBy.mockResolvedValue([entityA, entityB]);

      const results = await repo.findByTenantIds(['tenant-a', 'tenant-b']);

      expect(results).toHaveLength(2);
      expect(results.map((c) => c.tenantId)).toEqual(
        expect.arrayContaining(['tenant-a', 'tenant-b']),
      );
    });

    it('returns an empty array when no tenant ids match', async () => {
      mockRepo.findBy.mockResolvedValue([]);

      expect(await repo.findByTenantIds(['no-such-tenant'])).toEqual([]);
    });
  });

  // Version-guarded (M18-S03 follow-up, Codex review PR #291) — mirrors
  // typeorm-booking.repository.spec.ts's `save` describe block exactly: insert when
  // config.version is undefined, guarded update (id + tenant_id + version) otherwise, throwing
  // HotsiteConfigConcurrentModificationError when the guarded update affects zero rows.
  describe('save', () => {
    it('inserts a new aggregate when version is undefined, using the repo manager (no transaction active)', async () => {
      const branding = { ...DEFAULT_HOTSITE_BRANDING, primaryColor: '#112233' };
      const layout = [
        {
          type: 'HERO' as const,
          enabled: true,
          data: {
            variant: 'centered' as const,
            title: 'Bem-vindo',
            ctaLabel: 'Agendar',
            ctaTarget: 'booking-form' as const,
          },
        },
      ];
      const config = new HotsiteConfigBuilder()
        .withTenantId('tenant-id-2')
        .buildWithContent(branding, layout);
      expect(config.version).toBeUndefined();

      await repo.save(config);

      expect(mockManager.insert).toHaveBeenCalledTimes(1);
      const insertedEntity = mockManager.insert.mock.calls[0][1] as HotsiteConfigEntity;
      expect(insertedEntity.id).toBe(config.id);
      expect(insertedEntity.tenantId).toBe('tenant-id-2');
      expect(insertedEntity.branding).toEqual(branding);
      expect(insertedEntity.layout).toHaveLength(1);
      expect(insertedEntity.isPublished).toBe(false);
      expect(config.version).toBe(1);
    });

    it('performs a version-guarded update (id + tenant_id + version) once the aggregate has a version', async () => {
      const config = new HotsiteConfigBuilder().withTenantId('tenant-id-2').build();
      await repo.save(config); // version now 1, per the insert path above

      await repo.save(config);

      expect(mockManager.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(mockUpdateBuilder.where).toHaveBeenCalledWith('id = :id', { id: config.id });
      expect(mockUpdateBuilder.andWhere).toHaveBeenCalledWith('tenant_id = :tenantId', {
        tenantId: 'tenant-id-2',
      });
      expect(mockUpdateBuilder.andWhere).toHaveBeenCalledWith('version = :version', {
        version: 1,
      });
      expect(config.version).toBe(2);
    });

    it('throws HotsiteConfigConcurrentModificationError when the guarded update affects zero rows', async () => {
      const config = new HotsiteConfigBuilder().withTenantId('tenant-id-2').build();
      await repo.save(config);
      mockUpdateBuilder.execute.mockResolvedValue({ affected: 0 });

      await expect(repo.save(config)).rejects.toBeInstanceOf(
        HotsiteConfigConcurrentModificationError,
      );
    });

    it('uses the active EntityManager when inside a transaction', async () => {
      const txUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const txManager = {
        insert: jest.fn().mockResolvedValue({}),
        createQueryBuilder: jest.fn().mockReturnValue(txUpdateBuilder),
      } as unknown as EntityManager;
      const config = new HotsiteConfigBuilder().withTenantId('tx-tenant-id').build();

      await runWithEntityManager(txManager, () => repo.save(config));

      expect((txManager as unknown as { insert: jest.Mock }).insert).toHaveBeenCalledWith(
        HotsiteConfigEntity,
        expect.objectContaining({ tenantId: 'tx-tenant-id' }),
      );
      expect(mockManager.insert).not.toHaveBeenCalled();
    });
  });
});
