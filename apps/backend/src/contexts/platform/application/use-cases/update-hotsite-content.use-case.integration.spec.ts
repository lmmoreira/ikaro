import { DataSource } from 'typeorm';
import { createTestDataSource } from '../../../../test/test-datasource';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { TenantBuilder } from '../../../../test/builders/platform';
import { HotsiteConfig } from '../../domain/hotsite-config.aggregate';
import { HotsiteImagePathsService } from '../../domain/services/hotsite-image-paths.service';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import { HotsiteImagePromotionService } from '../services/hotsite-image-promotion.service';
import { HotsiteConfigEntity } from '../../infrastructure/entities/hotsite-config.entity';
import { LeadFormConfigEntity } from '../../infrastructure/entities/lead-form-config.entity';
import { TenantEntity } from '../../infrastructure/entities/tenant.entity';
import { TypeOrmHotsiteConfigRepository } from '../../infrastructure/repositories/typeorm-hotsite-config.repository';
import { TypeOrmLeadFormConfigRepository } from '../../infrastructure/repositories/typeorm-lead-form-config.repository';
import { TypeOrmTenantRepository } from '../../infrastructure/repositories/typeorm-tenant.repository';
import { ILeadFormConfigRepository } from '../ports/lead-form-config-repository.port';
import { LeadFormConfig } from '../../domain/lead-form-config.aggregate';
import { UpdateHotsiteContentUseCase } from './update-hotsite-content.use-case';

/** Forces a failure on the "second write" to prove the transaction genuinely wraps both saves. */
class ThrowingLeadFormConfigRepository implements ILeadFormConfigRepository {
  async findByTenantId(): Promise<LeadFormConfig | null> {
    return null;
  }

  async save(): Promise<void> {
    throw new Error('forced failure on the second write');
  }
}

describe('UpdateHotsiteContentUseCase (integration — real Postgres cross-aggregate transaction)', () => {
  let dataSource: DataSource;
  let tenantRepo: TypeOrmTenantRepository;
  let hotsiteConfigRepo: TypeOrmHotsiteConfigRepository;
  let leadFormConfigRepo: TypeOrmLeadFormConfigRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    tenantRepo = new TypeOrmTenantRepository(
      dataSource.getRepository(TenantEntity),
      new InMemoryEventBus(),
    );
    hotsiteConfigRepo = new TypeOrmHotsiteConfigRepository(
      dataSource.getRepository(HotsiteConfigEntity),
    );
    leadFormConfigRepo = new TypeOrmLeadFormConfigRepository(
      dataSource.getRepository(LeadFormConfigEntity),
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('writes both HotsiteConfig and LeadFormConfig in the same DB transaction when audienceMode/questions are present', async () => {
    const tenant = new TenantBuilder().withSlug('lead-form-tx-01').build();
    await tenantRepo.save(tenant);
    await hotsiteConfigRepo.save(HotsiteConfig.create(tenant.id));

    const txManager = new TypeOrmTransactionManager(dataSource);
    const imagePathsService = new HotsiteImagePathsService();
    const useCase = new UpdateHotsiteContentUseCase(
      hotsiteConfigRepo,
      leadFormConfigRepo,
      tenantRepo,
      txManager,
      imagePathsService,
      new HotsiteImagePromotionService(new InMemoryStorageService(), imagePathsService),
      new HotsiteImageUrlResolver(),
      new InMemoryStorageService(),
    );

    await useCase.execute({
      tenantId: tenant.id,
      layout: [
        {
          type: 'LEAD_FORM',
          enabled: false,
          data: { title: 'Fale com a gente', ctaLabel: 'Preencher formulário' },
        },
      ],
      audienceMode: 'CUSTOMER_ONLY',
    });

    const savedHotsiteConfig = await hotsiteConfigRepo.findByTenantId(tenant.id);
    const savedLeadFormConfig = await leadFormConfigRepo.findByTenantId(tenant.id);
    const leadFormModule = savedHotsiteConfig!.layout.find((m) => m.type === 'LEAD_FORM');

    expect((leadFormModule?.data as { title: string }).title).toBe('Fale com a gente');
    expect(savedLeadFormConfig!.audienceMode).toBe('CUSTOMER_ONLY');
  });

  it('rolls back the HotsiteConfig write when the LeadFormConfig write fails inside the same transaction', async () => {
    const tenant = new TenantBuilder().withSlug('lead-form-tx-02').build();
    await tenantRepo.save(tenant);
    await hotsiteConfigRepo.save(HotsiteConfig.create(tenant.id));

    const txManager = new TypeOrmTransactionManager(dataSource);
    const imagePathsService = new HotsiteImagePathsService();
    const failingUseCase = new UpdateHotsiteContentUseCase(
      hotsiteConfigRepo,
      new ThrowingLeadFormConfigRepository(),
      tenantRepo,
      txManager,
      imagePathsService,
      new HotsiteImagePromotionService(new InMemoryStorageService(), imagePathsService),
      new HotsiteImageUrlResolver(),
      new InMemoryStorageService(),
    );

    await expect(
      failingUseCase.execute({
        tenantId: tenant.id,
        layout: [{ type: 'LEAD_FORM', enabled: false, data: { title: 'Should not persist' } }],
        audienceMode: 'CUSTOMER_ONLY',
      }),
    ).rejects.toThrow('forced failure on the second write');

    // Nothing committed — the failed LeadFormConfig write rolled back HotsiteConfig's own save too.
    const savedHotsiteConfig = await hotsiteConfigRepo.findByTenantId(tenant.id);
    const leadFormModule = savedHotsiteConfig!.layout.find((m) => m.type === 'LEAD_FORM');
    expect(leadFormModule).toBeUndefined();

    const savedLeadFormConfig = await leadFormConfigRepo.findByTenantId(tenant.id);
    expect(savedLeadFormConfig).toBeNull();
  });

  it('does not touch LeadFormConfig at all when neither audienceMode nor questions is provided', async () => {
    const tenant = new TenantBuilder().withSlug('lead-form-tx-03').build();
    await tenantRepo.save(tenant);
    await hotsiteConfigRepo.save(HotsiteConfig.create(tenant.id));

    const txManager = new TypeOrmTransactionManager(dataSource);
    const imagePathsService = new HotsiteImagePathsService();
    const useCase = new UpdateHotsiteContentUseCase(
      hotsiteConfigRepo,
      leadFormConfigRepo,
      tenantRepo,
      txManager,
      imagePathsService,
      new HotsiteImagePromotionService(new InMemoryStorageService(), imagePathsService),
      new HotsiteImageUrlResolver(),
      new InMemoryStorageService(),
    );

    await useCase.execute({
      tenantId: tenant.id,
      branding: { brandName: 'Acme' },
    });

    const savedLeadFormConfig = await leadFormConfigRepo.findByTenantId(tenant.id);
    expect(savedLeadFormConfig).toBeNull();
  });
});
