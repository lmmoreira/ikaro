import { futureDate, pastDate } from '../../../../test/utils/date-helpers';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryTenantDayLock } from '../../../../test/infrastructure/in-memory-tenant-day-lock';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ScheduleClosureBuilder, ResourceBuilder } from '../../../../test/builders/booking/index';
import {
  ClosureDateInPastError,
  ScheduleAlreadyClosedError,
} from '../../domain/errors/booking-domain.error';
import { ResourceNotFoundError } from '../../domain/errors/resource.error';
import { ClosureReason } from '../../domain/schedule-closure.aggregate';
import { CloseScheduleUseCase } from './close-schedule.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const ACTOR_ID = '00000000-0000-7000-8000-000000000002';
const OTHER_TENANT_ID = '99999999-0000-7000-8000-000000000099';

const ctx = { tenantId: TENANT_ID, createdBy: ACTOR_ID };

describe('CloseScheduleUseCase', () => {
  let repo: InMemoryScheduleClosureRepository;
  let resourceRepo: InMemoryResourceRepository;
  let tenantDayLock: InMemoryTenantDayLock;
  let useCase: CloseScheduleUseCase;

  beforeEach(() => {
    repo = new InMemoryScheduleClosureRepository();
    resourceRepo = new InMemoryResourceRepository();
    tenantDayLock = new InMemoryTenantDayLock();
    useCase = new CloseScheduleUseCase(
      repo,
      resourceRepo,
      tenantDayLock,
      new InMemoryTransactionManager(),
    );
  });

  it('creates a full-day closure and returns the result', async () => {
    const result = await useCase.execute({
      date: futureDate(5),
      reason: ClosureReason.HOLIDAY,
      ...ctx,
    });

    expect(result.id).toBeDefined();
    expect(result.startTime).toBeNull();
    expect(result.endTime).toBeNull();
    expect(result.reason).toBe(ClosureReason.HOLIDAY);
    expect(result.createdBy).toBe(ACTOR_ID);
  });

  it('creates a partial closure with startTime and endTime', async () => {
    const result = await useCase.execute({
      date: futureDate(3),
      reason: ClosureReason.MAINTENANCE,
      startTime: '10:00',
      endTime: '12:00',
      ...ctx,
    });

    expect(result.startTime).toBe('10:00');
    expect(result.endTime).toBe('12:00');
  });

  it('throws ClosureDateInPastError for a past date', async () => {
    await expect(
      useCase.execute({ date: pastDate(1), reason: ClosureReason.HOLIDAY, ...ctx }),
    ).rejects.toThrow(ClosureDateInPastError);
  });

  it('throws ScheduleAlreadyClosedError when full-day closure already exists', async () => {
    const date = futureDate(5);
    await repo.save(new ScheduleClosureBuilder().withTenantId(TENANT_ID).withDate(date).build());

    await expect(useCase.execute({ date, reason: ClosureReason.HOLIDAY, ...ctx })).rejects.toThrow(
      ScheduleAlreadyClosedError,
    );
  });

  it('throws ScheduleAlreadyClosedError when overlapping partial closure exists', async () => {
    const date = futureDate(5);
    await repo.save(
      new ScheduleClosureBuilder()
        .withTenantId(TENANT_ID)
        .withDate(date)
        .withStartTime('10:00')
        .withEndTime('12:00')
        .build(),
    );

    await expect(
      useCase.execute({
        date,
        reason: ClosureReason.MAINTENANCE,
        startTime: '11:00',
        endTime: '13:00',
        ...ctx,
      }),
    ).rejects.toThrow(ScheduleAlreadyClosedError);
  });

  it('allows two non-overlapping partial closures on the same date', async () => {
    const date = futureDate(5);
    await repo.save(
      new ScheduleClosureBuilder()
        .withTenantId(TENANT_ID)
        .withDate(date)
        .withStartTime('08:00')
        .withEndTime('10:00')
        .build(),
    );

    const result = await useCase.execute({
      date,
      reason: ClosureReason.MAINTENANCE,
      startTime: '14:00',
      endTime: '16:00',
      ...ctx,
    });

    expect(result.id).toBeDefined();
  });

  it('throws ScheduleAlreadyClosedError when adding partial closure on a full-day-closed date', async () => {
    const date = futureDate(5);
    await repo.save(new ScheduleClosureBuilder().withTenantId(TENANT_ID).withDate(date).build());

    await expect(
      useCase.execute({
        date,
        reason: ClosureReason.MAINTENANCE,
        startTime: '10:00',
        endTime: '12:00',
        ...ctx,
      }),
    ).rejects.toThrow(ScheduleAlreadyClosedError);
  });

  it('persists the closure to the repository', async () => {
    const date = futureDate(7);
    const result = await useCase.execute({ date, reason: ClosureReason.STAFF_DAY_OFF, ...ctx });

    const stored = await repo.findById(result.id, TENANT_ID);
    expect(stored).not.toBeNull();
    expect(stored!.date).toBe(date);
  });

  it('does not check closures from another tenant', async () => {
    const date = futureDate(5);
    await repo.save(
      new ScheduleClosureBuilder()
        .withTenantId('99999999-0000-7000-8000-000000000099')
        .withDate(date)
        .build(),
    );

    const result = await useCase.execute({ date, reason: ClosureReason.HOLIDAY, ...ctx });
    expect(result.id).toBeDefined();
  });

  describe('resourceId (M21 Cluster 1)', () => {
    it('creates a resource-scoped closure when resourceId belongs to the tenant', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await resourceRepo.save(resource);

      const result = await useCase.execute({
        date: futureDate(5),
        reason: ClosureReason.HOLIDAY,
        resourceId: resource.id,
        ...ctx,
      });

      expect(result.resourceId).toBe(resource.id);
    });

    it('throws ResourceNotFoundError when resourceId does not exist', async () => {
      await expect(
        useCase.execute({
          date: futureDate(5),
          reason: ClosureReason.HOLIDAY,
          resourceId: '00000000-0000-7000-8000-000000000099',
          ...ctx,
        }),
      ).rejects.toThrow(ResourceNotFoundError);
    });

    it('throws ResourceNotFoundError when resourceId belongs to another tenant', async () => {
      const resource = new ResourceBuilder().withTenantId(OTHER_TENANT_ID).build();
      await resourceRepo.save(resource);

      await expect(
        useCase.execute({
          date: futureDate(5),
          reason: ClosureReason.HOLIDAY,
          resourceId: resource.id,
          ...ctx,
        }),
      ).rejects.toThrow(ResourceNotFoundError);
    });

    it('a resource-scoped closure and a tenant-wide closure on the same date do not collide', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await resourceRepo.save(resource);
      const date = futureDate(5);

      await useCase.execute({ date, reason: ClosureReason.HOLIDAY, ...ctx });
      const scoped = await useCase.execute({
        date,
        reason: ClosureReason.HOLIDAY,
        resourceId: resource.id,
        ...ctx,
      });

      expect(scoped.id).toBeDefined();
    });

    it('two resource-scoped closures for the same resource/date still collide', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await resourceRepo.save(resource);
      const date = futureDate(5);

      await useCase.execute({
        date,
        reason: ClosureReason.HOLIDAY,
        resourceId: resource.id,
        ...ctx,
      });

      await expect(
        useCase.execute({ date, reason: ClosureReason.HOLIDAY, resourceId: resource.id, ...ctx }),
      ).rejects.toThrow(ScheduleAlreadyClosedError);
    });
  });

  describe('tenant-day advisory lock (M21 Cluster 1, Codex PR #460 round-4 finding)', () => {
    it('acquires the (tenantId, date) lock before checking for overlaps on a tenant-wide closure', async () => {
      const date = futureDate(5);
      const lockSpy = jest.spyOn(tenantDayLock, 'lockTenantDay');

      await useCase.execute({ date, reason: ClosureReason.HOLIDAY, ...ctx });

      expect(lockSpy).toHaveBeenCalledWith(TENANT_ID, date);
    });

    it('acquires the (tenantId, date) lock before checking for overlaps on a resource-scoped closure', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await resourceRepo.save(resource);
      const date = futureDate(5);
      const lockSpy = jest.spyOn(tenantDayLock, 'lockTenantDay');

      await useCase.execute({
        date,
        reason: ClosureReason.HOLIDAY,
        resourceId: resource.id,
        ...ctx,
      });

      expect(lockSpy).toHaveBeenCalledWith(TENANT_ID, date);
    });
  });
});
