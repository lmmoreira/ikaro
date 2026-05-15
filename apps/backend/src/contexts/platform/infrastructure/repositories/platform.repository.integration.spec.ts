import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { HotsiteConfig } from '../../domain/hotsite-config.aggregate';
import { Tenant } from '../../domain/tenant.aggregate';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { CreatePlatformTenants1716500000001 } from '../migrations/1716500000001-CreatePlatformTenants';
import { CreatePlatformHotsiteConfigs1716500000002 } from '../migrations/1716500000002-CreatePlatformHotsiteConfigs';
import { TypeOrmHotsiteConfigRepository } from './typeorm-hotsite-config.repository';
import { TypeOrmTenantRepository } from './typeorm-tenant.repository';

describe('Platform repositories (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let tenantRepo: TypeOrmTenantRepository;
  let hotsiteRepo: TypeOrmHotsiteConfigRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:15-alpine').start();

    dataSource = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      synchronize: false,
      migrationsRun: false,
      entities: [TenantEntity, HotsiteConfigEntity],
      migrations: [CreatePlatformTenants1716500000001, CreatePlatformHotsiteConfigs1716500000002],
    });

    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "platform"`);
    await dataSource.runMigrations();

    const tenantTypeOrmRepo = dataSource.getRepository(TenantEntity);
    const hotsiteTypeOrmRepo = dataSource.getRepository(HotsiteConfigEntity);

    tenantRepo = new TypeOrmTenantRepository(tenantTypeOrmRepo);
    hotsiteRepo = new TypeOrmHotsiteConfigRepository(hotsiteTypeOrmRepo);
  }, 60000);

  afterAll(async () => {
    await dataSource.destroy();
    await container.stop();
  });

  describe('TypeOrmTenantRepository', () => {
    it('saves and retrieves a tenant by slug', async () => {
      const tenant = Tenant.create('BeloAuto Teste', 'beloauto-teste', 'America/Sao_Paulo');
      await tenantRepo.save(tenant);

      const found = await tenantRepo.findBySlug('beloauto-teste');

      expect(found).not.toBeNull();
      expect(found!.id).toBe(tenant.id);
      expect(found!.name).toBe('BeloAuto Teste');
      expect(found!.slug).toBe('beloauto-teste');
      expect(found!.isActive).toBe(true);
      expect(found!.settings.business_hours.timezone).toBe('America/Sao_Paulo');
    });

    it('returns null for a non-existent slug', async () => {
      const result = await tenantRepo.findBySlug('nao-existe');
      expect(result).toBeNull();
    });

    it('finds a tenant by id', async () => {
      const tenant = Tenant.create('Outro Lavacar', 'outro-lavacar');
      await tenantRepo.save(tenant);

      const found = await tenantRepo.findById(tenant.id);

      expect(found).not.toBeNull();
      expect(found!.slug).toBe('outro-lavacar');
    });

    it('returns null when findById receives an unknown id', async () => {
      const result = await tenantRepo.findById('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });

    it('existsBySlug returns true for existing slug', async () => {
      const tenant = Tenant.create('Existe Sim', 'existe-sim');
      await tenantRepo.save(tenant);

      expect(await tenantRepo.existsBySlug('existe-sim')).toBe(true);
    });

    it('existsBySlug returns false for unknown slug', async () => {
      expect(await tenantRepo.existsBySlug('nao-existe-mesmo')).toBe(false);
    });

    it('updates tenant settings on subsequent save', async () => {
      const tenant = Tenant.create('Update Test', 'update-test');
      await tenantRepo.save(tenant);

      tenant.deactivate();
      await tenantRepo.save(tenant);

      const found = await tenantRepo.findBySlug('update-test');
      expect(found!.isActive).toBe(false);
    });
  });

  describe('TypeOrmHotsiteConfigRepository', () => {
    it('saves and retrieves a hotsite config by tenantId', async () => {
      const tenant = Tenant.create('Hotsite Test', 'hotsite-test');
      await tenantRepo.save(tenant);

      const config = HotsiteConfig.create(tenant.id);
      await hotsiteRepo.save(config);

      const found = await hotsiteRepo.findByTenantId(tenant.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(config.id);
      expect(found!.tenantId).toBe(tenant.id);
      expect(found!.isPublished).toBe(false);
    });

    it('returns null for an unknown tenantId', async () => {
      const result = await hotsiteRepo.findByTenantId('00000000-0000-0000-0000-000000000001');
      expect(result).toBeNull();
    });

    it('updates config content on subsequent save', async () => {
      const tenant = Tenant.create('Branding Test', 'branding-test');
      await tenantRepo.save(tenant);

      const config = HotsiteConfig.create(tenant.id);
      await hotsiteRepo.save(config);

      config.updateContent({ primaryColor: '#FF5733' }, [{ type: 'HERO', order: 1 }]);
      await hotsiteRepo.save(config);

      const found = await hotsiteRepo.findByTenantId(tenant.id);
      expect(found!.branding.primaryColor).toBe('#FF5733');
      expect(found!.layout).toHaveLength(1);
    });
  });

  describe('Tenant isolation', () => {
    it('cannot retrieve Tenant A config when querying with Tenant B id', async () => {
      const tenantA = Tenant.create('Tenant A', 'tenant-a');
      const tenantB = Tenant.create('Tenant B', 'tenant-b');
      await tenantRepo.save(tenantA);
      await tenantRepo.save(tenantB);

      const configA = HotsiteConfig.create(tenantA.id);
      await hotsiteRepo.save(configA);

      const result = await hotsiteRepo.findByTenantId(tenantB.id);
      expect(result).toBeNull();
    });
  });
});
