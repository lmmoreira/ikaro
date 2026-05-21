import { HttpException, HttpStatus } from '@nestjs/common';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import { CreateServiceUseCase } from '../../application/use-cases/create-service.use-case';
import { ServiceController } from './service.controller';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const CORRELATION_ID = 'corr-ctrl-svc-test';

function makeController(tenantId = TENANT_A): {
  controller: ServiceController;
  repo: InMemoryServiceRepository;
} {
  const repo = new InMemoryServiceRepository();
  const ctx = {
    tenantId,
    correlationId: CORRELATION_ID,
    actorId: '20000000-0000-4000-8000-000000000001',
    actorType: 'STAFF',
    actorRole: 'MANAGER',
  } as unknown as TenantContext;
  const useCase = new CreateServiceUseCase(repo, new InMemoryTransactionManager(), ctx);
  const controller = new ServiceController(useCase);
  return { controller, repo };
}

const validBody = {
  name: 'Lavagem Completa',
  priceAmount: 150,
  durationMinutes: 60,
  loyaltyPointsValue: 10,
};

describe('ServiceController', () => {
  describe('create()', () => {
    it('returns 201 with service DTO including pt-BR formatted price', async () => {
      const { controller } = makeController();
      const result = await controller.create(validBody);

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Lavagem Completa');
      expect(result.price.formatted).toBe('R$ 150,00');
      expect(result.isActive).toBe(true);
    });

    it('created service is scoped to TenantContext tenantId', async () => {
      const { controller, repo } = makeController();
      const result = await controller.create(validBody);

      const found = await repo.findById(result.id, TENANT_A);
      expect(found).not.toBeNull();
      expect(found!.tenantId).toBe(TENANT_A);
    });

    it('maps BookingDomainError to 400 when price is zero', async () => {
      const { controller } = makeController();
      const err = await controller
        .create({ ...validBody, priceAmount: 0 })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('maps BookingDomainError to 400 when durationMinutes is zero', async () => {
      const { controller } = makeController();
      const err = await controller
        .create({ ...validBody, durationMinutes: 0 })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });
  });
});
