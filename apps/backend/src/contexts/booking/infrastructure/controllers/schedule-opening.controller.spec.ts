import { HttpException } from '@nestjs/common';
import { futureDate, nextWeekday, pastDate } from '../../../../test/utils/date-helpers';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ScheduleOpeningBuilder, ResourceBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { OpenScheduleUseCase } from '../../application/use-cases/open-schedule.use-case';
import { ListOpeningsUseCase } from '../../application/use-cases/list-openings.use-case';
import { RemoveScheduleOpeningUseCase } from '../../application/use-cases/remove-schedule-opening.use-case';
import { ScheduleOpeningController } from './schedule-opening.controller';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const ACTOR_ID = '00000000-0000-7000-8000-000000000002';

describe('ScheduleOpeningController', () => {
  let repo: InMemoryScheduleOpeningRepository;
  let resourceRepo: InMemoryResourceRepository;
  let controller: ScheduleOpeningController;

  function buildController(actorRole: 'STAFF' | 'MANAGER' = 'STAFF'): ScheduleOpeningController {
    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_ID)
      .withActorId(ACTOR_ID)
      .withActorRole(actorRole)
      .build();
    const tx = new InMemoryTransactionManager();
    return new ScheduleOpeningController(
      ctx,
      new OpenScheduleUseCase(repo, resourceRepo, tx),
      new RemoveScheduleOpeningUseCase(repo, tx),
      new ListOpeningsUseCase(repo),
    );
  }

  beforeEach(() => {
    repo = new InMemoryScheduleOpeningRepository();
    resourceRepo = new InMemoryResourceRepository();
    controller = buildController();
  });

  describe('create()', () => {
    it('returns 201 result for a normally-closed day', async () => {
      const date = nextWeekday(0); // Sunday — closed by default
      const result = await controller.create({ date, startTime: '09:00', endTime: '14:00' });

      expect(result.id).toBeDefined();
      expect(result.date).toBe(date);
      expect(result.startTime).toBe('09:00');
      expect(result.endTime).toBe('14:00');
    });

    it('maps OpeningDateInPastError to 422', async () => {
      const err = await controller
        .create({ date: pastDate(1), startTime: '09:00', endTime: '14:00' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
    });

    it('maps DayAlreadyOpenInSettingsError to 422', async () => {
      const err = await controller
        .create({ date: nextWeekday(1), startTime: '09:00', endTime: '14:00' }) // Monday — open by default
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
    });

    it('maps ScheduleOpeningAlreadyExistsError to 409', async () => {
      const date = nextWeekday(0);
      await repo.save(new ScheduleOpeningBuilder().withTenantId(TENANT_ID).withDate(date).build());

      const err = await controller
        .create({ date, startTime: '09:00', endTime: '14:00' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(409);
    });
  });

  describe('remove()', () => {
    it('deletes an opening and returns void', async () => {
      const opening = new ScheduleOpeningBuilder()
        .withTenantId(TENANT_ID)
        .withDate(futureDate(5))
        .build();
      await repo.save(opening);

      const result = await controller.remove(opening.id);
      expect(result).toBeUndefined();
    });

    it('maps ScheduleOpeningNotFoundError to 404', async () => {
      const err = await controller
        .remove('00000000-0000-7000-8000-000000000099')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });
  });

  describe('list()', () => {
    it('returns items in the requested range', async () => {
      await repo.save(
        new ScheduleOpeningBuilder().withTenantId(TENANT_ID).withDate('2026-12-28').build(),
      );

      const result = await controller.list({ from: '2026-12-01', to: '2026-12-31' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].date).toBe('2026-12-28');
    });

    it('returns empty list when no openings in range', async () => {
      const result = await controller.list({ from: '2026-11-01', to: '2026-11-30' });
      expect(result.items).toHaveLength(0);
    });
  });

  describe('resourceId auth (M21 Cluster 1)', () => {
    it('STAFF gets 403 when resourceId is set', async () => {
      const staffController = buildController('STAFF');
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await resourceRepo.save(resource);

      // create() throws synchronously for this path (throwProblemDetail, not a rejected
      // promise) — wrap in an async invocation so .catch() has something to attach to.
      const err = await (async () =>
        staffController.create({
          date: nextWeekday(0),
          startTime: '09:00',
          endTime: '14:00',
          resourceId: resource.id,
        }))().catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(403);
    });

    it('MANAGER can create a resource-scoped opening', async () => {
      const managerController = buildController('MANAGER');
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await resourceRepo.save(resource);

      const result = await managerController.create({
        date: nextWeekday(0),
        startTime: '09:00',
        endTime: '14:00',
        resourceId: resource.id,
      });

      expect(result.resourceId).toBe(resource.id);
    });

    it('STAFF can still create a tenant-wide opening (resourceId omitted)', async () => {
      const result = await controller.create({
        date: nextWeekday(0),
        startTime: '09:00',
        endTime: '14:00',
      });
      expect(result.resourceId).toBeNull();
    });

    it('maps OpeningExceedsTenantWindowError to 422', async () => {
      const managerController = buildController('MANAGER');
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await resourceRepo.save(resource);
      const date = nextWeekday(0);

      await managerController.create({ date, startTime: '09:00', endTime: '14:00' });

      const err = await managerController
        .create({ date, startTime: '08:00', endTime: '15:00', resourceId: resource.id })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
    });
  });
});
