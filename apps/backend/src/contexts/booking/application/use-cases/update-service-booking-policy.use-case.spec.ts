import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import {
  BookingServiceBookingConfigModelMismatchError,
  ServiceDurationPolicyRequiresPricingError,
  ServiceNotFoundError,
} from '../../domain/errors/booking-domain.error';
import { UpdateServiceBookingPolicyUseCase } from './update-service-booking-policy.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';

describe('UpdateServiceBookingPolicyUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let bookingPlatform: InMemoryBookingPlatformPort;
  let useCase: UpdateServiceBookingPolicyUseCase;

  beforeEach(() => {
    serviceRepo = new InMemoryServiceRepository();
    bookingPlatform = new InMemoryBookingPlatformPort();
    useCase = new UpdateServiceBookingPolicyUseCase(
      serviceRepo,
      bookingPlatform,
      new InMemoryTransactionManager(),
    );
  });

  it('persists all policy fields', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);

    const result = await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      defaultApprovalMode: 'MANUAL_APPROVAL',
      manualHoldMinutes: 30,
      cancellationWindowHoursOverride: 24,
      recurrenceEligible: true,
      availabilityAlertEligible: true,
    });

    expect(result.bookingPolicy.defaultApprovalMode).toBe('MANUAL_APPROVAL');
    expect(result.bookingPolicy.manualHoldMinutes).toBe(30);
    expect(result.bookingPolicy.cancellationWindowHoursOverride).toBe(24);
    expect(result.bookingPolicy.recurrenceEligible).toBe(true);
    expect(result.bookingPolicy.availabilityAlertEligible).toBe(true);
  });

  it('leaves an omitted field unchanged, and explicitly clears a field set to null (PATCH semantics)', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      defaultApprovalMode: 'MANUAL_APPROVAL',
      cancellationWindowHoursOverride: 24,
    });

    const result = await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      cancellationWindowHoursOverride: null,
    });

    expect(result.bookingPolicy.defaultApprovalMode).toBe('MANUAL_APPROVAL');
    expect(result.bookingPolicy.cancellationWindowHoursOverride).toBeNull();
  });

  it('resolves a null defaultApprovalMode from the tenant autoApproveEnabled=true setting on read', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    bookingPlatform.seedAutoApproveEnabled(TENANT_A, true);

    const result = await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      recurrenceEligible: true,
    });

    expect(result.bookingPolicy.defaultApprovalMode).toBe('AUTO_CONFIRM');
  });

  it('resolves a null defaultApprovalMode from the tenant autoApproveEnabled=false setting on read', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    bookingPlatform.seedAutoApproveEnabled(TENANT_A, false);

    const result = await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      recurrenceEligible: true,
    });

    expect(result.bookingPolicy.defaultApprovalMode).toBe('MANUAL_APPROVAL');
  });

  it('never persists the tenant-inherited defaultApprovalMode onto the service row', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    bookingPlatform.seedAutoApproveEnabled(TENANT_A, true);

    await useCase.execute({ id: service.id, tenantId: TENANT_A, recurrenceEligible: true });

    const persisted = await serviceRepo.findById(service.id, TENANT_A);
    expect(persisted?.bookingPolicy.defaultApprovalMode).toBeNull();
  });

  it('rejects durationPolicy=CUSTOMER_SELECTED without a non-FIXED pricingPolicy (UC-055 A2, 422)', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);

    await expect(
      useCase.execute({ id: service.id, tenantId: TENANT_A, durationPolicy: 'CUSTOMER_SELECTED' }),
    ).rejects.toThrow(ServiceDurationPolicyRequiresPricingError);
  });

  describe('booking window overrides (M23-S33)', () => {
    beforeEach(() => {
      bookingPlatform.seedTenantBookingWindow(TENANT_A, {
        minBookingAdvanceHours: 2,
        maxBookingAdvanceDays: 90,
      });
    });

    async function saved() {
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await serviceRepo.save(service);
      return service;
    }

    it('accepts overrides that tighten the tenant window', async () => {
      const service = await saved();

      const result = await useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        minBookingAdvanceHoursOverride: 24,
        maxBookingAdvanceDaysOverride: 30,
      });

      expect(result.bookingPolicy.minBookingAdvanceHoursOverride).toBe(24);
      expect(result.bookingPolicy.maxBookingAdvanceDaysOverride).toBe(30);
    });

    it('rejects a maximum above the tenant maximum (422)', async () => {
      const service = await saved();

      await expect(
        useCase.execute({
          id: service.id,
          tenantId: TENANT_A,
          maxBookingAdvanceDaysOverride: 120,
        }),
      ).rejects.toMatchObject({
        name: 'ServiceBookingPolicyInvalidError',
        field: 'maxBookingAdvanceDaysOverride',
      });
    });

    it('rejects a minimum notice below the tenant minimum (422)', async () => {
      const service = await saved();

      await expect(
        useCase.execute({
          id: service.id,
          tenantId: TENANT_A,
          minBookingAdvanceHoursOverride: 1,
        }),
      ).rejects.toMatchObject({
        name: 'ServiceBookingPolicyInvalidError',
        field: 'minBookingAdvanceHoursOverride',
      });
    });

    it('rejects a minimum notice that leaves no bookable day, checked against the tenant side', async () => {
      const service = await saved();
      bookingPlatform.seedTenantBookingWindow(TENANT_A, {
        minBookingAdvanceHours: 0,
        maxBookingAdvanceDays: 7,
      });

      await expect(
        useCase.execute({
          id: service.id,
          tenantId: TENANT_A,
          minBookingAdvanceHoursOverride: 24 * 10,
        }),
      ).rejects.toMatchObject({ name: 'ServiceBookingPolicyInvalidError' });
    });

    it('does not block an unrelated edit when an earlier override has gone stale', async () => {
      const service = await saved();
      await useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        maxBookingAdvanceDaysOverride: 80,
      });
      bookingPlatform.seedTenantBookingWindow(TENANT_A, {
        minBookingAdvanceHours: 2,
        maxBookingAdvanceDays: 30,
      });

      const result = await useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        manualHoldMinutes: 45,
      });

      expect(result.bookingPolicy.manualHoldMinutes).toBe(45);
    });

    it('does not block re-sending a stale override unchanged along with other fields', async () => {
      const service = await saved();
      await useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        maxBookingAdvanceDaysOverride: 80,
      });
      bookingPlatform.seedTenantBookingWindow(TENANT_A, {
        minBookingAdvanceHours: 2,
        maxBookingAdvanceDays: 30,
      });

      const result = await useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        maxBookingAdvanceDaysOverride: 80,
        manualHoldMinutes: 45,
      });

      expect(result.bookingPolicy.manualHoldMinutes).toBe(45);
      expect(result.bookingPolicy.effectiveMaxBookingAdvanceDays).toBe(30);
    });

    it('clearing an override with null is always allowed', async () => {
      const service = await saved();

      const result = await useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        maxBookingAdvanceDaysOverride: null,
      });

      expect(result.bookingPolicy.maxBookingAdvanceDaysOverride).toBeNull();
    });
  });

  it('rejects on a SESSION service (409)', async () => {
    const sessionService = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withBookingModel('SESSION')
      .withResourceRequirements([])
      .withBufferAfterMinutes(null)
      .withClassResourceSlots([])
      .build();
    await serviceRepo.save(sessionService);

    await expect(
      useCase.execute({ id: sessionService.id, tenantId: TENANT_A, recurrenceEligible: true }),
    ).rejects.toThrow(BookingServiceBookingConfigModelMismatchError);
  });

  it('throws ServiceNotFoundError when the service does not exist', async () => {
    await expect(
      useCase.execute({ id: 'missing', tenantId: TENANT_A, recurrenceEligible: true }),
    ).rejects.toThrow(ServiceNotFoundError);
  });

  it('tenant isolation: a cross-tenant service id is treated as not found', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);

    await expect(
      useCase.execute({
        id: service.id,
        tenantId: '10000000-0000-4000-8000-000000000002',
        recurrenceEligible: true,
      }),
    ).rejects.toThrow(ServiceNotFoundError);
  });
});
