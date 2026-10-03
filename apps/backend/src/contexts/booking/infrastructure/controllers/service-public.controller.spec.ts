import { HttpException, HttpStatus } from '@nestjs/common';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ResourceBuilder, ServiceBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { BookingQuoteService } from '../../application/services/booking-quote.service';
import { ListServiceResourceOptionsUseCase } from '../../application/use-cases/list-service-resource-options.use-case';
import { QuoteServiceDurationUseCase } from '../../application/use-cases/quote-service-duration.use-case';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ServicePublicController } from './service-public.controller';

const TENANT_A = '10000000-0000-4000-8000-0000000029c1';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000009999';

describe('ServicePublicController (M23-S29)', () => {
  let controller: ServicePublicController;
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;

  beforeEach(() => {
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    const ctx = new RequestContextBuilder().withTenantId(TENANT_A).build();
    controller = new ServicePublicController(
      ctx,
      new ListServiceResourceOptionsUseCase(serviceRepo, resourceRepo),
      new QuoteServiceDurationUseCase(serviceRepo, new BookingQuoteService()),
    );
  });

  describe('listResourceOptions()', () => {
    it('returns the CUSTOMER_CHOICE requirements with { resourceId, name } options only', async () => {
      await resourceRepo.save(
        new ResourceBuilder()
          .withTenantId(TENANT_A)
          .withType(ResourceType.STAFF)
          .withRefId(uuidv7())
          .withName('Ana')
          .build(),
      );
      const service = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withResourceRequirements([
          ResourceRequirement.create({
            type: ResourceType.STAFF,
            selectionMode: 'CUSTOMER_CHOICE',
          }),
        ])
        .build();
      await serviceRepo.save(service);

      const result = await controller.listResourceOptions(service.id);

      expect(result.requirements).toHaveLength(1);
      expect(Object.keys(result.requirements[0].options[0]).sort()).toEqual(['name', 'resourceId']);
    });

    it('maps ServiceNotFoundError to 404', async () => {
      const err = await controller.listResourceOptions(UNKNOWN_ID).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('quote()', () => {
    const variablePolicy = {
      durationPolicy: 'CUSTOMER_SELECTED' as const,
      durationMinMinutes: 60,
      durationMaxMinutes: 240,
      durationIncrementMinutes: 30,
      pricingPolicy: 'FIXED' as const,
    };

    it('returns the duration and price for a chosen duration', async () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withBookingPolicy(variablePolicy)
        .build();
      await serviceRepo.save(service);

      const result = await controller.quote(service.id, { durationMinutes: 90 });

      expect(result.durationMinutes).toBe(90);
      expect(result.price.currency).toBe('BRL');
    });

    it('maps BookingDurationOutOfRangeError to 422', async () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withBookingPolicy(variablePolicy)
        .build();
      await serviceRepo.save(service);

      const err = await controller
        .quote(service.id, { durationMinutes: 500 })
        .catch((e: unknown) => e);

      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('maps ServiceNotFoundError to 404', async () => {
      const err = await controller.quote(UNKNOWN_ID, {}).catch((e: unknown) => e);

      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
