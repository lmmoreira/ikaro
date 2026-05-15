import { Repository } from 'typeorm';
import { Tenant } from '../../domain/tenant.aggregate';
import { TenantSettings } from '../../domain/value-objects/tenant-settings.vo';
import { TenantEntity } from '../entities/tenant.entity';
import { TypeOrmTenantRepository } from './typeorm-tenant.repository';

function makeEntity(overrides: Partial<TenantEntity> = {}): TenantEntity {
  const e = new TenantEntity();
  e.id = 'tenant-id-1';
  e.name = 'BeloAuto';
  e.slug = 'beloauto';
  e.settings = TenantSettings.default().toJSON();
  e.isActive = true;
  e.createdAt = new Date('2026-01-01T00:00:00Z');
  e.updatedAt = new Date('2026-01-01T00:00:00Z');
  return Object.assign(e, overrides);
}

describe('TypeOrmTenantRepository', () => {
  let mockRepo: jest.Mocked<Repository<TenantEntity>>;
  let repo: TypeOrmTenantRepository;

  beforeEach(() => {
    mockRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      existsBy: jest.fn(),
    } as unknown as jest.Mocked<Repository<TenantEntity>>;
    repo = new TypeOrmTenantRepository(mockRepo);
  });

  describe('findBySlug', () => {
    it('returns a Tenant aggregate when found', async () => {
      const entity = makeEntity();
      mockRepo.findOne.mockResolvedValue(entity);

      const result = await repo.findBySlug('beloauto');

      expect(result).toBeInstanceOf(Tenant);
      expect(result!.id).toBe('tenant-id-1');
      expect(result!.slug).toBe('beloauto');
      expect(result!.name).toBe('BeloAuto');
      expect(result!.isActive).toBe(true);
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { slug: 'beloauto' } });
    });

    it('returns null when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      expect(await repo.findBySlug('nao-existe')).toBeNull();
    });

    it('reconstitutes TenantSettings from stored JSONB', async () => {
      const entity = makeEntity();
      mockRepo.findOne.mockResolvedValue(entity);

      const result = await repo.findBySlug('beloauto');

      expect(result!.settings).toBeInstanceOf(TenantSettings);
      expect(result!.settings.loyalty.expiry_days).toBe(180);
      expect(result!.settings.business_hours.timezone).toBe('America/Sao_Paulo');
    });
  });

  describe('findById', () => {
    it('returns a Tenant aggregate when found', async () => {
      const entity = makeEntity();
      mockRepo.findOne.mockResolvedValue(entity);

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
    it('maps domain aggregate to entity and persists it', async () => {
      const tenant = Tenant.create('Novo Lavacar', 'novo-lavacar');
      mockRepo.save.mockResolvedValue({} as TenantEntity);

      await repo.save(tenant);

      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      const savedEntity: TenantEntity = mockRepo.save.mock.calls[0][0] as TenantEntity;
      expect(savedEntity.id).toBe(tenant.id);
      expect(savedEntity.name).toBe('Novo Lavacar');
      expect(savedEntity.slug).toBe('novo-lavacar');
      expect(savedEntity.isActive).toBe(true);
      expect(savedEntity.settings).toEqual(tenant.settings.toJSON());
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
