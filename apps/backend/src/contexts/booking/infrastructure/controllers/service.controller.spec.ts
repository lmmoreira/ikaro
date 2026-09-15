import { HttpException, HttpStatus } from '@nestjs/common';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryServiceIntakeSchemaRepository } from '../../../../test/repositories/booking/in-memory-service-intake-schema.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ResourceBuilder, ServiceBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { ResourceType } from '../../domain/resource.types';
import { ActivateServiceUseCase } from '../../application/use-cases/activate-service.use-case';
import { CreateServiceUseCase } from '../../application/use-cases/create-service.use-case';
import { DeactivateServiceUseCase } from '../../application/use-cases/deactivate-service.use-case';
import { GetServiceByIdUseCase } from '../../application/use-cases/get-service-by-id.use-case';
import { GetServicesUseCase } from '../../application/use-cases/get-services.use-case';
import { UpdateServiceLegsUseCase } from '../../application/use-cases/update-service-legs.use-case';
import { UpdateServiceResourceRequirementsUseCase } from '../../application/use-cases/update-service-resource-requirements.use-case';
import { UpdateServiceBookingPolicyUseCase } from '../../application/use-cases/update-service-booking-policy.use-case';
import { PublishServiceIntakeSchemaUseCase } from '../../application/use-cases/publish-service-intake-schema.use-case';
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
  let resourceRepo: InMemoryResourceRepository;
  let intakeSchemaRepo: InMemoryServiceIntakeSchemaRepository;

  beforeEach(async () => {
    repo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    intakeSchemaRepo = new InMemoryServiceIntakeSchemaRepository();
    await resourceRepo.save(
      new ResourceBuilder()
        .withTenantId(TENANT_A)
        .withType(ResourceType.STAFF)
        .withRefId(uuidv7())
        .build(),
    );
    const bookingRepo = new InMemoryBookingRepository();
    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withCorrelationId(CORRELATION_ID)
      .withActorId('20000000-0000-4000-8000-000000000001')
      .withActorType('STAFF')
      .withActorRole('MANAGER')
      .build();
    const txManager = new InMemoryTransactionManager();
    const bookingPlatform = new InMemoryBookingPlatformPort();
    controller = new ServiceController(
      ctx,
      new CreateServiceUseCase(repo, resourceRepo, bookingPlatform, txManager),
      new GetServicesUseCase(repo, bookingPlatform),
      new GetServiceByIdUseCase(repo, bookingPlatform),
      new ActivateServiceUseCase(repo, bookingPlatform, txManager),
      new UpdateServiceUseCase(repo, bookingRepo, resourceRepo, bookingPlatform, txManager),
      new DeactivateServiceUseCase(repo, bookingPlatform, txManager),
      new UpdateServiceResourceRequirementsUseCase(repo, resourceRepo, bookingPlatform, txManager),
      new UpdateServiceLegsUseCase(repo, resourceRepo, bookingPlatform, txManager),
      new UpdateServiceBookingPolicyUseCase(repo, bookingPlatform, txManager),
      new PublishServiceIntakeSchemaUseCase(repo, intakeSchemaRepo, bookingPlatform, txManager),
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

  describe('updateResourceRequirements()', () => {
    it('sets a flat resource requirement', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await repo.save(service);

      const result = await controller.updateResourceRequirements(service.id, {
        resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }],
      });

      expect(result.resourceRequirements).toHaveLength(1);
    });

    it('maps ServiceNotFoundError to 404', async () => {
      const err = await controller
        .updateResourceRequirements('non-existent-id', {
          resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }],
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('updateLegs()', () => {
    it('sets sequential legs and returns the total span', async () => {
      await resourceRepo.save(
        new ResourceBuilder().withTenantId(TENANT_A).withType(ResourceType.ROOM).build(),
      );
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await repo.save(service);

      const result = await controller.updateLegs(service.id, {
        legs: [
          {
            legIndex: 0,
            name: 'Sauna',
            durationMinutes: 20,
            resourceRequirements: [{ type: 'ROOM', selectionMode: 'AUTO_ANY' }],
            transitionGapAfterMinutes: 10,
          },
          {
            legIndex: 1,
            name: 'Massagem',
            durationMinutes: 50,
            resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }],
          },
        ],
      });

      expect(result.legs).toHaveLength(2);
      expect(result.totalSpanMinutes).toBe(80);
    });

    it('maps BookingServiceLegsTooFewError to 422', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await repo.save(service);

      const err = await controller
        .updateLegs(service.id, {
          legs: [
            {
              legIndex: 0,
              name: 'Sauna',
              durationMinutes: 20,
              resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }],
            },
          ],
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  describe('updateBookingPolicy()', () => {
    it('sets booking policy fields', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await repo.save(service);

      const result = await controller.updateBookingPolicy(service.id, {
        defaultApprovalMode: 'MANUAL_APPROVAL',
        recurrenceEligible: true,
      });

      expect(result.bookingPolicy.defaultApprovalMode).toBe('MANUAL_APPROVAL');
      expect(result.bookingPolicy.recurrenceEligible).toBe(true);
    });

    it('maps ServiceDurationPolicyRequiresPricingError to 422 (UC-055 A2)', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await repo.save(service);

      const err = await controller
        .updateBookingPolicy(service.id, { durationPolicy: 'CUSTOMER_SELECTED' })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('maps ServiceNotFoundError to 404', async () => {
      const err = await controller
        .updateBookingPolicy('non-existent-id', { recurrenceEligible: true })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('publishIntakeSchema()', () => {
    const validQuestions = [
      {
        fieldKey: 'accessNeeds',
        label: 'Necessidades de acesso',
        type: 'FREE_TEXT' as const,
        required: false,
      },
    ];

    it('publishes the first version, starting at 1', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await repo.save(service);

      const result = await controller.publishIntakeSchema(service.id, {
        questions: validQuestions,
        consentText: 'Concordo com os termos',
      });

      expect(result.version).toBe(1);
    });

    it('sets requiresPickupAddress when a PICKUP_ADDRESS question is included (UC-054 A2)', async () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withRequiresPickupAddress(false)
        .build();
      await repo.save(service);

      await controller.publishIntakeSchema(service.id, {
        questions: [
          {
            fieldKey: 'pickup',
            label: 'Endereço de coleta',
            type: 'PICKUP_ADDRESS',
            required: true,
          },
        ],
        consentText: 'Concordo',
      });

      const updated = await repo.findById(service.id, TENANT_A);
      expect(updated?.requiresPickupAddress).toBe(true);
    });

    it('maps ServiceNotFoundError to 404', async () => {
      const err = await controller
        .publishIntakeSchema('non-existent-id', {
          questions: validQuestions,
          consentText: 'Concordo',
        })
        .catch((e: unknown) => e);
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
