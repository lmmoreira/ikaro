import { HttpException } from '@nestjs/common';
import { AvailabilityAlertBuilder, ServiceBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryAvailabilityAlertRepository } from '../../../../test/repositories/booking/in-memory-availability-alert.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { TenantSettings } from '../../../platform/domain/value-objects/tenant-settings.vo';
import { CancelAvailabilityAlertUseCase } from '../../application/use-cases/cancel-availability-alert.use-case';
import { CreateAvailabilityAlertUseCase } from '../../application/use-cases/create-availability-alert.use-case';
import { ListAvailabilityAlertsUseCase } from '../../application/use-cases/list-availability-alerts.use-case';
import { UpdateAvailabilityAlertUseCase } from '../../application/use-cases/update-availability-alert.use-case';
import { AvailabilityAlertController } from './availability-alert.controller';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000002';
const OTHER_CUSTOMER_ID = '00000000-0000-7000-8000-000000000003';

const weeklyBody = (serviceId: string) => ({
  serviceId,
  criteriaType: 'WEEKLY_PREFERENCE' as const,
  weekdays: ['tuesday' as const],
  localStartTime: '18:00',
  localEndTime: '20:00',
});

async function statusOf(promise: Promise<unknown>): Promise<number | undefined> {
  const err = await promise.catch((e: unknown) => e);
  return err instanceof HttpException ? err.getStatus() : undefined;
}

describe('AvailabilityAlertController', () => {
  let alertRepo: InMemoryAvailabilityAlertRepository;
  let serviceRepo: InMemoryServiceRepository;
  let controller: AvailabilityAlertController;
  let eligibleServiceId: string;
  let ineligibleServiceId: string;

  const buildController = (actorId: string): AvailabilityAlertController => {
    const tx = new InMemoryTransactionManager();
    const resourceRepo = new InMemoryResourceRepository();
    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_ID)
      .withSettings(TenantSettings.default('America/Manaus').toJSON())
      .withActorId(actorId)
      .withActorType('CUSTOMER')
      .withActorRole('CUSTOMER')
      .build();
    return new AvailabilityAlertController(
      ctx,
      new CreateAvailabilityAlertUseCase(
        serviceRepo,
        resourceRepo,
        alertRepo,
        new InMemoryTenantLock(),
        tx,
      ),
      new ListAvailabilityAlertsUseCase(alertRepo),
      new UpdateAvailabilityAlertUseCase(alertRepo, serviceRepo, resourceRepo, tx),
      new CancelAvailabilityAlertUseCase(alertRepo, tx),
    );
  };

  beforeEach(async () => {
    alertRepo = new InMemoryAvailabilityAlertRepository(new InMemoryEventBus());
    serviceRepo = new InMemoryServiceRepository();
    const eligible = new ServiceBuilder()
      .withTenantId(TENANT_ID)
      .withBookingPolicy({ availabilityAlertEligible: true })
      .build();
    const ineligible = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(eligible);
    await serviceRepo.save(ineligible);
    eligibleServiceId = eligible.id;
    ineligibleServiceId = ineligible.id;
    controller = buildController(CUSTOMER_ID);
  });

  describe('create()', () => {
    it("creates the alert for the caller, in the tenant's timezone", async () => {
      const result = await controller.create(weeklyBody(eligibleServiceId));

      expect(result).toMatchObject({ status: 'ACTIVE', timezone: 'America/Manaus' });
      expect((await alertRepo.findById(result.id, TENANT_ID))?.customerId).toBe(CUSTOMER_ID);
    });

    it('maps an ineligible service to 422', async () => {
      expect(await statusOf(controller.create(weeklyBody(ineligibleServiceId)))).toBe(422);
    });

    it('maps an invalid criteria set to 422', async () => {
      expect(
        await statusOf(
          controller.create({ ...weeklyBody(eligibleServiceId), weekdays: [] as never }),
        ),
      ).toBe(422);
    });

    it('maps an unknown service to 400', async () => {
      expect(
        await statusOf(controller.create(weeklyBody('00000000-0000-7000-8000-000000000099'))),
      ).toBe(400);
    });

    it('maps the per-customer cap to 409', async () => {
      for (let i = 0; i < 10; i++) {
        alertRepo.seed(new AvailabilityAlertBuilder().withCustomerId(CUSTOMER_ID).build());
      }

      expect(await statusOf(controller.create(weeklyBody(eligibleServiceId)))).toBe(409);
    });
  });

  describe('list()', () => {
    it("returns only the caller's alerts", async () => {
      const own = new AvailabilityAlertBuilder().withCustomerId(CUSTOMER_ID).build();
      alertRepo.seed(own);
      alertRepo.seed(new AvailabilityAlertBuilder().withCustomerId(OTHER_CUSTOMER_ID).build());

      const result = await controller.list();

      expect(result.items.map((item) => item.id)).toEqual([own.id]);
    });
  });

  describe('update()', () => {
    it("changes the caller's own alert", async () => {
      const own = new AvailabilityAlertBuilder().withCustomerId(CUSTOMER_ID).build();
      alertRepo.seed(own);

      const result = await controller.update(own.id, { durationMinutes: 45 });

      expect(result).toMatchObject({ id: own.id, durationMinutes: 45 });
    });

    it("maps another customer's alert to 404", async () => {
      const foreign = new AvailabilityAlertBuilder().withCustomerId(OTHER_CUSTOMER_ID).build();
      alertRepo.seed(foreign);

      expect(await statusOf(controller.update(foreign.id, { durationMinutes: 45 }))).toBe(404);
    });

    it('maps a read-only (notified) alert to 409', async () => {
      const notified = new AvailabilityAlertBuilder()
        .withCustomerId(CUSTOMER_ID)
        .withStatus('NOTIFIED')
        .build();
      alertRepo.seed(notified);

      expect(await statusOf(controller.update(notified.id, { durationMinutes: 45 }))).toBe(409);
    });

    it('maps a criteria mix to 422', async () => {
      const own = new AvailabilityAlertBuilder().withCustomerId(CUSTOMER_ID).build();
      alertRepo.seed(own);

      expect(await statusOf(controller.update(own.id, { weekdays: ['monday'] }))).toBe(422);
    });
  });

  describe('cancel()', () => {
    it("cancels the caller's own alert", async () => {
      const own = new AvailabilityAlertBuilder().withCustomerId(CUSTOMER_ID).build();
      alertRepo.seed(own);

      await expect(controller.cancel(own.id)).resolves.toEqual({ id: own.id, status: 'CANCELLED' });
    });

    it("maps another customer's alert to 404", async () => {
      const foreign = new AvailabilityAlertBuilder().withCustomerId(OTHER_CUSTOMER_ID).build();
      alertRepo.seed(foreign);

      expect(await statusOf(controller.cancel(foreign.id))).toBe(404);
    });

    it('maps an expired alert to 409', async () => {
      const expired = new AvailabilityAlertBuilder()
        .withCustomerId(CUSTOMER_ID)
        .withStatus('EXPIRED')
        .build();
      alertRepo.seed(expired);

      expect(await statusOf(controller.cancel(expired.id))).toBe(409);
    });
  });
});
