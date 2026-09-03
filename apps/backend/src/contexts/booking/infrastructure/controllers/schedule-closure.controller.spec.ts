import { HttpException } from '@nestjs/common';
import { futureDate, pastDate } from '../../../../test/utils/date-helpers';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryTenantDayLock } from '../../../../test/infrastructure/in-memory-tenant-day-lock';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ScheduleClosureBuilder, ResourceBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { ClosureReason } from '../../domain/schedule-closure.aggregate';
import { CloseScheduleUseCase } from '../../application/use-cases/close-schedule.use-case';
import { ListClosuresUseCase } from '../../application/use-cases/list-closures.use-case';
import { RemoveClosureUseCase } from '../../application/use-cases/remove-closure.use-case';
import { ScheduleClosureController } from './schedule-closure.controller';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const ACTOR_ID = '00000000-0000-7000-8000-000000000002';

describe('ScheduleClosureController', () => {
  let repo: InMemoryScheduleClosureRepository;
  let resourceRepo: InMemoryResourceRepository;
  let controller: ScheduleClosureController;

  function buildController(actorRole: 'STAFF' | 'MANAGER' = 'STAFF'): ScheduleClosureController {
    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_ID)
      .withActorId(ACTOR_ID)
      .withActorRole(actorRole)
      .build();
    const tx = new InMemoryTransactionManager();
    return new ScheduleClosureController(
      ctx,
      new CloseScheduleUseCase(repo, resourceRepo, new InMemoryTenantDayLock(), tx),
      new RemoveClosureUseCase(repo, tx),
      new ListClosuresUseCase(repo),
    );
  }

  beforeEach(() => {
    repo = new InMemoryScheduleClosureRepository();
    resourceRepo = new InMemoryResourceRepository();
    controller = buildController();
  });

  describe('create()', () => {
    it('returns result for a full-day closure', async () => {
      const result = await controller.create({
        date: futureDate(5),
        reason: ClosureReason.HOLIDAY,
      });

      expect(result.id).toBeDefined();
      expect(result.startTime).toBeNull();
      expect(result.reason).toBe(ClosureReason.HOLIDAY);
    });

    it('returns result for a partial closure', async () => {
      const result = await controller.create({
        date: futureDate(3),
        reason: ClosureReason.MAINTENANCE,
        startTime: '10:00',
        endTime: '12:00',
      });

      expect(result.startTime).toBe('10:00');
      expect(result.endTime).toBe('12:00');
    });

    it('maps ClosureDateInPastError to 422', async () => {
      const err = await controller
        .create({ date: pastDate(1), reason: ClosureReason.HOLIDAY })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
    });

    it('maps ScheduleAlreadyClosedError to 409 when duplicate', async () => {
      const date = futureDate(5);
      await repo.save(new ScheduleClosureBuilder().withTenantId(TENANT_ID).withDate(date).build());

      const err = await controller
        .create({ date, reason: ClosureReason.HOLIDAY })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(409);
    });
  });

  describe('remove()', () => {
    it('deletes a closure and returns void', async () => {
      const closure = new ScheduleClosureBuilder()
        .withTenantId(TENANT_ID)
        .withDate(futureDate(5))
        .build();
      await repo.save(closure);

      const result = await controller.remove(closure.id);
      expect(result).toBeUndefined();
    });

    it('maps ScheduleClosureNotFoundError to 404', async () => {
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
        new ScheduleClosureBuilder().withTenantId(TENANT_ID).withDate('2026-12-25').build(),
      );

      const result = await controller.list({ from: '2026-12-01', to: '2026-12-31' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].date).toBe('2026-12-25');
    });

    it('returns empty list when no closures in range', async () => {
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
          date: futureDate(5),
          reason: ClosureReason.HOLIDAY,
          resourceId: resource.id,
        }))().catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(403);
    });

    it('MANAGER can create a resource-scoped closure', async () => {
      const managerController = buildController('MANAGER');
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await resourceRepo.save(resource);

      const result = await managerController.create({
        date: futureDate(5),
        reason: ClosureReason.HOLIDAY,
        resourceId: resource.id,
      });

      expect(result.resourceId).toBe(resource.id);
    });

    it('STAFF can still create a tenant-wide closure (resourceId omitted)', async () => {
      const result = await controller.create({
        date: futureDate(5),
        reason: ClosureReason.HOLIDAY,
      });
      expect(result.resourceId).toBeNull();
    });
  });
});
