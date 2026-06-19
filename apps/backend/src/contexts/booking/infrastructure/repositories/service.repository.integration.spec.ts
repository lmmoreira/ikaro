import { DataSource } from 'typeorm';
import { createTestDataSource } from '../../../../test/test-datasource';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { InMemoryTenantLocalizationPort } from '../../../../test/infrastructure/in-memory-tenant-localization.port';
import { Money } from '../../../../shared/value-objects/money';
import { ServiceEntity } from '../entities/service.entity';
import { TypeOrmServiceRepository } from './typeorm-service.repository';

describe('TypeOrmServiceRepository (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmServiceRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmServiceRepository(
      dataSource.getRepository(ServiceEntity),
      new InMemoryTenantLocalizationPort(),
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('saves a service and retrieves it — all fields survive the round-trip', async () => {
    const service = new ServiceBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000050')
      .withName('Lavagem Completa')
      .withPrice(Money.from(150, 'BRL'))
      .withDurationMinutes(60)
      .withLoyaltyPointsValue(10)
      .build();

    await repo.save(service);

    const found = await repo.findById(service.id, '00000000-0000-0000-0000-000000000050');
    expect(found).not.toBeNull();
    expect(found!.id).toBe(service.id);
    expect(found!.name).toBe('Lavagem Completa');
    expect(found!.price.amount.toNumber()).toBe(150);
    expect(found!.price.currency).toBe('BRL');
    expect(found!.price.format('pt-BR', 'BRL')).toBe('R$ 150,00');
    expect(found!.durationMinutes).toBe(60);
    expect(found!.loyaltyPointsValue).toBe(10);
    expect(found!.isActive).toBe(true);
  });

  it('findAllByTenant returns only active services when onlyActive=true', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000051';

    const active = new ServiceBuilder().withTenantId(tenantId).withName('Ativo').build();
    const inactive = new ServiceBuilder().withTenantId(tenantId).withName('Inativo').build();
    inactive.deactivate();

    await repo.save(active);
    await repo.save(inactive);

    const results = await repo.findAllByTenant(tenantId, true);
    expect(results.every((s) => s.isActive)).toBe(true);
    expect(results.some((s) => s.name === 'Ativo')).toBe(true);
    expect(results.some((s) => s.name === 'Inativo')).toBe(false);
  });

  it('findById returns null for wrong tenant (isolation)', async () => {
    const service = new ServiceBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000052')
      .build();
    await repo.save(service);

    const result = await repo.findById(service.id, '00000000-0000-0000-0000-000000000099');
    expect(result).toBeNull();
  });

  it('findAllByTenant returns only services for the given tenant', async () => {
    const tenantA = '00000000-0000-0000-0000-000000000053';
    const tenantB = '00000000-0000-0000-0000-000000000054';

    const svcA1 = new ServiceBuilder().withTenantId(tenantA).withName('Serviço A1').build();
    const svcA2 = new ServiceBuilder().withTenantId(tenantA).withName('Serviço A2').build();
    const svcB = new ServiceBuilder().withTenantId(tenantB).withName('Serviço B').build();

    await repo.save(svcA1);
    await repo.save(svcA2);
    await repo.save(svcB);

    const results = await repo.findAllByTenant(tenantA);
    expect(results.every((s) => s.tenantId === tenantA)).toBe(true);
    expect(results.some((s) => s.name === 'Serviço A1')).toBe(true);
    expect(results.some((s) => s.name === 'Serviço A2')).toBe(true);
    expect(results.some((s) => s.name === 'Serviço B')).toBe(false);
  });
});
