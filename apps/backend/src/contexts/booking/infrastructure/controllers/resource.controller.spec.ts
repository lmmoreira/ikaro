import { HttpException } from '@nestjs/common';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingStaffPort } from '../../../../test/infrastructure/in-memory-booking-staff.port';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { CreateResourceUseCase } from '../../application/use-cases/create-resource.use-case';
import { UpdateResourceUseCase } from '../../application/use-cases/update-resource.use-case';
import { DeactivateResourceUseCase } from '../../application/use-cases/deactivate-resource.use-case';
import { ReactivateResourceUseCase } from '../../application/use-cases/reactivate-resource.use-case';
import { ListResourcesUseCase } from '../../application/use-cases/list-resources.use-case';
import { StaffWrapValidationService } from '../../application/services/staff-wrap-validation.service';
import { ResourceType } from '../../domain/resource.types';
import { ResourceController } from './resource.controller';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';

describe('ResourceController', () => {
  let repo: InMemoryResourceRepository;
  let staffPort: InMemoryBookingStaffPort;
  let controller: ResourceController;

  beforeEach(() => {
    repo = new InMemoryResourceRepository();
    staffPort = new InMemoryBookingStaffPort();
    const ctx = new RequestContextBuilder().withTenantId(TENANT_ID).build();
    const tx = new InMemoryTransactionManager();
    const staffWrapValidation = new StaffWrapValidationService(staffPort, repo);
    controller = new ResourceController(
      ctx,
      new CreateResourceUseCase(repo, staffWrapValidation, tx),
      new UpdateResourceUseCase(repo, staffWrapValidation, tx),
      new DeactivateResourceUseCase(repo, tx),
      new ReactivateResourceUseCase(repo, staffPort, tx),
      new ListResourcesUseCase(repo),
    );
  });

  describe('create()', () => {
    it('creates a ROOM resource', async () => {
      const result = await controller.create({ type: ResourceType.ROOM, name: 'Estúdio 1' });
      expect(result.id).toBeDefined();
      expect(result.type).toBe(ResourceType.ROOM);
    });

    it('maps ResourceStaffNotFoundError to 404', async () => {
      const err = await controller
        .create({
          type: ResourceType.STAFF,
          refId: '00000000-0000-7000-8000-000000000099',
          name: 'X',
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });

    it('maps ResourceStaffAlreadyWrappedError to 409', async () => {
      const staffId = '00000000-0000-7000-8000-000000000050';
      staffPort.setProfile(staffId, { id: staffId, isActive: true });
      await repo.save(
        new ResourceBuilder()
          .withTenantId(TENANT_ID)
          .withType(ResourceType.STAFF)
          .withRefId(staffId)
          .build(),
      );

      const err = await controller
        .create({ type: ResourceType.STAFF, refId: staffId, name: 'Camila (again)' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(409);
    });
  });

  describe('update()', () => {
    it('updates working hours', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await repo.save(resource);

      const result = await controller.update(resource.id, {
        workingHours: {
          monday: { open: '10:00', close: '16:00' },
          tuesday: null,
          wednesday: null,
          thursday: null,
          friday: null,
          saturday: null,
          sunday: null,
        },
      });

      expect(result.workingHours?.monday).toEqual({ open: '10:00', close: '16:00' });
    });

    it('updates name, turnoverMinutes, and maxCapacity without touching workingHours', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).withName('Estúdio 1').build();
      await repo.save(resource);

      const result = await controller.update(resource.id, {
        name: 'Estúdio 2',
        turnoverMinutes: 20,
        maxCapacity: 8,
      });

      expect(result.name).toBe('Estúdio 2');
      expect(result.turnoverMinutes).toBe(20);
      expect(result.maxCapacity).toBe(8);
    });

    it('corrects a mistaken type from ROOM to EQUIPMENT', async () => {
      const resource = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await repo.save(resource);

      const result = await controller.update(resource.id, { type: ResourceType.EQUIPMENT });

      expect(result.type).toBe(ResourceType.EQUIPMENT);
    });

    it('maps ResourceLocationTypeImmutableError to 409 for a LOCATION resource', async () => {
      const resource = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.LOCATION)
        .build();
      await repo.save(resource);

      const err = await controller
        .update(resource.id, { type: ResourceType.ROOM })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(409);
    });

    it('maps ResourceNotFoundError to 404', async () => {
      const err = await controller
        .update('00000000-0000-7000-8000-000000000099', { workingHours: null })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });
  });

  describe('deactivate()', () => {
    it('deactivates a resource and returns void', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await repo.save(resource);

      const result = await controller.deactivate(resource.id);
      expect(result).toBeUndefined();
      expect((await repo.findById(resource.id, TENANT_ID))!.isActive).toBe(false);
    });

    it('maps ResourceNotFoundError to 404', async () => {
      const err = await controller
        .deactivate('00000000-0000-7000-8000-000000000099')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });
  });

  describe('reactivate()', () => {
    it('reactivates a resource', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      resource.deactivate();
      await repo.save(resource);

      const result = await controller.reactivate(resource.id);
      expect(result.isActive).toBe(true);
    });

    it('maps ResourceAlreadyActiveError to 409', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await repo.save(resource);

      const err = await controller.reactivate(resource.id).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(409);
    });
  });

  describe('list()', () => {
    it('returns all resources for the tenant', async () => {
      await repo.save(new ResourceBuilder().withTenantId(TENANT_ID).build());
      const result = await controller.list({});
      expect(result.items).toHaveLength(1);
    });
  });
});
