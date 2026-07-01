import { HttpException, HttpStatus } from '@nestjs/common';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { ActivateServiceUseCase } from '../../application/use-cases/activate-service.use-case';
import { CreateServiceUseCase } from '../../application/use-cases/create-service.use-case';
import { DeactivateServiceUseCase } from '../../application/use-cases/deactivate-service.use-case';
import { GetServiceByIdUseCase } from '../../application/use-cases/get-service-by-id.use-case';
import { GetServicesUseCase } from '../../application/use-cases/get-services.use-case';
import { UpdateServiceUseCase } from '../../application/use-cases/update-service.use-case';
import { ServiceController } from './service.controller';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const CORRELATION_ID = 'corr-ctrl-svc-test';

const validBody = {
  name: 'Lavagem Completa',
  priceAmount: 150,
  durationMinutes: 60,
  loyaltyPointsValue: 10,
};

describe('ServiceController', () => {
  let controller: ServiceController;
  let repo: InMemoryServiceRepository;

  beforeEach(() => {
    repo = new InMemoryServiceRepository();
    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withCorrelationId(CORRELATION_ID)
      .withActorId('20000000-0000-4000-8000-000000000001')
      .withActorType('STAFF')
      .withActorRole('MANAGER')
      .build();
    const txManager = new InMemoryTransactionManager();
    controller = new ServiceController(
      ctx,
      new CreateServiceUseCase(repo, txManager),
      new GetServicesUseCase(repo),
      new GetServiceByIdUseCase(repo),
      new ActivateServiceUseCase(repo, txManager, ctx),
      new UpdateServiceUseCase(repo, txManager),
      new DeactivateServiceUseCase(repo, txManager),
    );
  });

  describe('create()', () => {
    it('returns 201 with service DTO including pt-BR formatted price', async () => {
      const result = await controller.create(validBody);
      expect(result.id).toBeDefined();
      expect(result.price.formatted).toBe('R$\u00A0150,00');
      expect(result.isActive).toBe(true);
    });

    it('maps BookingDomainError to 400 when price is zero', async () => {
      const err = await controller
        .create({ ...validBody, priceAmount: 0 })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('list()', () => {
    it('returns active and inactive services for STAFF/MANAGER', async () => {
      const active = new ServiceBuilder().withTenantId(TENANT_A).withName('Ativo').build();
      const inactive = new ServiceBuilder().withTenantId(TENANT_A).withName('Inativo').build();
      inactive.deactivate();
      await repo.save(active);
      await repo.save(inactive);

      const result = await controller.list();
      expect(result.items).toHaveLength(2);
    });

    it('returns empty list when no services', async () => {
      const result = await controller.list();
      expect(result.items).toHaveLength(0);
    });
  });

  describe('getOne()', () => {
    it('returns the service including inactive ones', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      service.deactivate();
      await repo.save(service);

      const result = await controller.getOne(service.id);
      expect(result.id).toBe(service.id);
      expect(result.isActive).toBe(false);
    });

    it('maps ServiceNotFoundError to 404', async () => {
      const err = await controller
        .getOne('00000000-0000-4000-8000-000000009999')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('update()', () => {
    it('updates fields and returns updated DTO', async () => {
      await repo.save(new ServiceBuilder().withTenantId(TENANT_A).withName('Original').build());
      const list = await controller.list();
      const id = list.items[0].id;

      const result = await controller.update(id, { name: 'Atualizado' });
      expect(result.name).toBe('Atualizado');
    });

    it('maps ServiceNotFoundError to 404', async () => {
      const err = await controller
        .update('non-existent-id', { name: 'X' })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('maps ServiceDeactivatedError to 409', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      service.deactivate();
      await repo.save(service);

      const err = await controller.update(service.id, { name: 'X' }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    });
  });

  describe('activate()', () => {
    it('sets isActive=true and returns { id, isActive: true }', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      service.deactivate();
      await repo.save(service);

      const result = await controller.activate(service.id);
      expect(result.id).toBe(service.id);
      expect(result.isActive).toBe(true);
    });

    it('maps ServiceNotFoundError to 404', async () => {
      const err = await controller.activate('non-existent-id').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('deactivate()', () => {
    it('sets isActive=false and returns { id, isActive: false }', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await repo.save(service);

      const result = await controller.deactivate(service.id);
      expect(result.id).toBe(service.id);
      expect(result.isActive).toBe(false);
    });

    it('maps ServiceNotFoundError to 404', async () => {
      const err = await controller.deactivate('non-existent-id').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
