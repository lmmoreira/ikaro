import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { DEFAULT_HOTSITE_BRANDING, HotsiteConfig } from '../../domain/hotsite-config.aggregate';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { TypeOrmHotsiteConfigRepository } from './typeorm-hotsite-config.repository';
import {
  HotsiteConfigBuilder,
  HotsiteConfigEntityBuilder,
} from '../../../../test/builders/platform';

describe('TypeOrmHotsiteConfigRepository', () => {
  let mockRepo: jest.Mocked<Repository<HotsiteConfigEntity>>;
  let repo: TypeOrmHotsiteConfigRepository;

  beforeEach(() => {
    mockRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<HotsiteConfigEntity>>;
    repo = new TypeOrmHotsiteConfigRepository(mockRepo);
  });

  describe('findByTenantId', () => {
    it('returns a HotsiteConfig aggregate when found', async () => {
      mockRepo.findOne.mockResolvedValue(new HotsiteConfigEntityBuilder().build());

      const result = await repo.findByTenantId('tenant-id-1');

      expect(result).toBeInstanceOf(HotsiteConfig);
      expect(result!.id).toBe('config-id-1');
      expect(result!.tenantId).toBe('tenant-id-1');
      expect(result!.isPublished).toBe(false);
      expect(result!.branding).toEqual(DEFAULT_HOTSITE_BRANDING);
      expect(result!.layout).toHaveLength(1);
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

  describe('save', () => {
    it('maps domain aggregate to entity and persists via repo when no transaction is active', async () => {
      const branding = { ...DEFAULT_HOTSITE_BRANDING, primaryColor: '#112233' };
      const layout = [
        {
          type: 'HERO' as const,
          enabled: true,
          data: {
            variant: 'centered' as const,
            title: 'Bem-vindo',
            ctaLabel: 'Agendar',
            ctaTarget: 'booking' as const,
          },
        },
      ];
      const config = new HotsiteConfigBuilder()
        .withTenantId('tenant-id-2')
        .buildWithContent(branding, layout);
      mockRepo.save.mockResolvedValue({} as HotsiteConfigEntity);

      await repo.save(config);

      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      const savedEntity = mockRepo.save.mock.calls[0][0] as HotsiteConfigEntity;
      expect(savedEntity.id).toBe(config.id);
      expect(savedEntity.tenantId).toBe('tenant-id-2');
      expect(savedEntity.branding).toEqual(branding);
      expect(savedEntity.layout).toHaveLength(1);
      expect(savedEntity.isPublished).toBe(false);
    });

    it('uses the active EntityManager when inside a transaction', async () => {
      const mockManager = {
        save: jest.fn().mockResolvedValue({}),
      } as unknown as EntityManager;
      const config = new HotsiteConfigBuilder().withTenantId('tx-tenant-id').build();

      await runWithEntityManager(mockManager, () => repo.save(config));

      expect(mockManager.save).toHaveBeenCalledWith(
        HotsiteConfigEntity,
        expect.objectContaining({ tenantId: 'tx-tenant-id' }),
      );
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });
});
