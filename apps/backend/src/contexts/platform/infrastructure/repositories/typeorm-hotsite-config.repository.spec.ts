import { Repository } from 'typeorm';
import { HotsiteConfig } from '../../domain/hotsite-config.aggregate';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { TypeOrmHotsiteConfigRepository } from './typeorm-hotsite-config.repository';

function makeEntity(overrides: Partial<HotsiteConfigEntity> = {}): HotsiteConfigEntity {
  const e = new HotsiteConfigEntity();
  e.id = 'config-id-1';
  e.tenantId = 'tenant-id-1';
  e.branding = { primaryColor: '#FFFFFF' };
  e.layout = [{ type: 'HERO', order: 1 }];
  e.isPublished = false;
  e.updatedAt = new Date('2026-01-01T00:00:00Z');
  return Object.assign(e, overrides);
}

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
      const entity = makeEntity();
      mockRepo.findOne.mockResolvedValue(entity);

      const result = await repo.findByTenantId('tenant-id-1');

      expect(result).toBeInstanceOf(HotsiteConfig);
      expect(result!.id).toBe('config-id-1');
      expect(result!.tenantId).toBe('tenant-id-1');
      expect(result!.isPublished).toBe(false);
      expect(result!.branding).toEqual({ primaryColor: '#FFFFFF' });
      expect(result!.layout).toHaveLength(1);
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { tenantId: 'tenant-id-1' } });
    });

    it('returns null when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      expect(await repo.findByTenantId('unknown-tenant')).toBeNull();
    });

    it('correctly maps isPublished = true', async () => {
      const entity = makeEntity({ isPublished: true });
      mockRepo.findOne.mockResolvedValue(entity);

      const result = await repo.findByTenantId('tenant-id-1');
      expect(result!.isPublished).toBe(true);
    });
  });

  describe('save', () => {
    it('maps domain aggregate to entity and persists it', async () => {
      const config = HotsiteConfig.create('tenant-id-2');
      config.updateContent({ primaryColor: '#112233' }, [{ type: 'HERO', order: 1 }]);
      mockRepo.save.mockResolvedValue({} as HotsiteConfigEntity);

      await repo.save(config);

      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      const savedEntity: HotsiteConfigEntity = mockRepo.save.mock
        .calls[0][0] as HotsiteConfigEntity;
      expect(savedEntity.id).toBe(config.id);
      expect(savedEntity.tenantId).toBe('tenant-id-2');
      expect(savedEntity.branding).toEqual({ primaryColor: '#112233' });
      expect(savedEntity.layout).toHaveLength(1);
      expect(savedEntity.isPublished).toBe(false);
    });
  });
});
