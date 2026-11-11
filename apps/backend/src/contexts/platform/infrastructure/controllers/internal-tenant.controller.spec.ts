import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import { TRANSACTION_MANAGER } from '../../../../shared/ports/transaction-manager.port';
import { HOTSITE_CONFIG_REPOSITORY } from '../../application/ports/hotsite-config-repository.port';
import { TENANT_REPOSITORY } from '../../application/ports/tenant-repository.port';
import { ProvisionTenantUseCase } from '../../application/use-cases/provision-tenant.use-case';
import { InternalTenantController } from './internal-tenant.controller';

describe('InternalTenantController', () => {
  let controller: InternalTenantController;
  let tenantRepo: InMemoryTenantRepository;
  let eventBus: InMemoryEventBus;

  beforeEach(async () => {
    eventBus = new InMemoryEventBus();
    tenantRepo = new InMemoryTenantRepository(eventBus);

    const moduleRef = await Test.createTestingModule({
      controllers: [InternalTenantController],
      providers: [
        ProvisionTenantUseCase,
        { provide: TENANT_REPOSITORY, useValue: tenantRepo },
        { provide: HOTSITE_CONFIG_REPOSITORY, useValue: new InMemoryHotsiteConfigRepository() },
        { provide: EVENT_BUS, useValue: eventBus },
        { provide: TRANSACTION_MANAGER, useValue: new InMemoryTransactionManager() },
        { provide: ConfigService, useValue: { getOrThrow: () => 'test-platform-admin-key' } },
      ],
    }).compile();

    controller = moduleRef.get(InternalTenantController);
  });

  it('provisions a tenant and returns tenantId, name, slug', async () => {
    const result = await controller.provision({
      name: 'Lavacar Belo',
      slug: 'lavacar-belo',
      adminEmail: 'admin@lavacar.com.br',
      country_code: 'BR',
      taxId: '529.982.247-25',
    });

    expect(result.slug).toBe('lavacar-belo');
    expect(result.name).toBe('Lavacar Belo');
    expect(result.tenantId).toBeDefined();
    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0].eventName).toBe('TenantProvisioned');
  });

  it('maps SlugAlreadyTakenError to 409 HttpException', async () => {
    await controller.provision({
      name: 'A',
      slug: 'taken',
      adminEmail: 'a@a.com',
      country_code: 'BR',
      taxId: '529.982.247-25',
    });

    expect.assertions(2);
    try {
      await controller.provision({
        name: 'B',
        slug: 'taken',
        adminEmail: 'b@b.com',
        country_code: 'BR',
        taxId: '529.982.247-25',
      });
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    }
  });

  it('maps PlatformDomainError to 400 HttpException for invalid domain input', async () => {
    expect.assertions(2);
    try {
      await controller.provision({
        name: '',
        slug: 'valid',
        adminEmail: 'a@a.com',
        country_code: 'BR',
        taxId: '529.982.247-25',
      });
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  it.each([
    ['a missing tax id', undefined, 'SIGNUP_TAX_ID_REQUIRED'],
    ['an invalid tax id', '529.982.247-26', 'SIGNUP_TAX_ID_INVALID'],
  ])(
    'maps %s on a non-exempt BR tenant to 422 and creates nothing',
    async (_label, taxId, code) => {
      expect.assertions(4);
      try {
        await controller.provision({
          name: 'Fiscal',
          slug: 'fiscal',
          adminEmail: 'a@a.com',
          country_code: 'BR',
          taxId,
        });
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(JSON.stringify((err as HttpException).getResponse())).toContain(code);
      }
      expect(eventBus.published).toHaveLength(0);
    },
  );

  it('passes exempt, features and registrationId through to the published hint', async () => {
    await controller.provision({
      name: 'Parceiro',
      slug: 'parceiro',
      adminEmail: 'p@p.com',
      country_code: 'BR',
      exempt: true,
      features: ['HOTSITE', 'BOOKING'],
    });

    const event = eventBus.published[0] as unknown as { data: Record<string, unknown> };
    expect(event.data['billingHint']).toEqual({ exempt: true, features: ['HOTSITE', 'BOOKING'] });
  });
});
