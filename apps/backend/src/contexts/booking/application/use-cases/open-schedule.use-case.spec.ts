import { pastDate, nextWeekday } from '../../../../test/utils/date-helpers';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryTenantDayLock } from '../../../../test/infrastructure/in-memory-tenant-day-lock';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ScheduleOpeningBuilder, ResourceBuilder } from '../../../../test/builders/booking/index';
import { TenantSettings } from '../../../platform/domain/value-objects/tenant-settings.vo';
import { OpenScheduleUseCase } from './open-schedule.use-case';
import {
  DayAlreadyOpenInSettingsError,
  OpeningDateInPastError,
  OpeningExceedsTenantWindowError,
  ScheduleOpeningAlreadyExistsError,
  TenantOpeningRequiredError,
} from '../../domain/errors/booking-domain.error';
import { ResourceNotFoundError } from '../../domain/errors/resource.error';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const ACTOR_ID = '00000000-0000-7000-8000-000000000002';
const OTHER_TENANT_ID = '99999999-0000-7000-8000-000000000099';

describe('OpenScheduleUseCase', () => {
  let repo: InMemoryScheduleOpeningRepository;
  let resourceRepo: InMemoryResourceRepository;
  let tenantDayLock: InMemoryTenantDayLock;
  let useCase: OpenScheduleUseCase;
  let settings: TenantSettings;

  beforeEach(() => {
    repo = new InMemoryScheduleOpeningRepository();
    resourceRepo = new InMemoryResourceRepository();
    tenantDayLock = new InMemoryTenantDayLock();
    settings = TenantSettings.default();
    const tx = new InMemoryTransactionManager();
    useCase = new OpenScheduleUseCase(repo, resourceRepo, tenantDayLock, tx);
  });

  it('creates an opening for a normally-closed day', async () => {
    const date = nextWeekday(0); // Sunday — closed by default
    const result = await useCase.execute({
      date,
      startTime: '09:00',
      endTime: '14:00',
      tenantId: TENANT_ID,
      createdBy: ACTOR_ID,
      businessHours: settings.businessHours,
    });

    expect(result.id).toBeDefined();
    expect(result.date).toBe(date);
    expect(result.startTime).toBe('09:00');
    expect(result.endTime).toBe('14:00');
    expect(result.createdBy).toBe(ACTOR_ID);
  });

  it('stores the opening in the repository', async () => {
    const date = nextWeekday(0);
    await useCase.execute({
      date,
      startTime: '10:00',
      endTime: '13:00',
      tenantId: TENANT_ID,
      createdBy: ACTOR_ID,
      businessHours: settings.businessHours,
    });

    const stored = await repo.findByTenantAndDate(TENANT_ID, date);
    expect(stored).not.toBeNull();
    expect(stored!.startTime.value).toBe('10:00');
  });

  it('throws OpeningDateInPastError for a past date', async () => {
    await expect(
      useCase.execute({
        date: pastDate(1),
        startTime: '09:00',
        endTime: '14:00',
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      }),
    ).rejects.toThrow(OpeningDateInPastError);
  });

  it('throws DayAlreadyOpenInSettingsError when day is open in businessHours', async () => {
    const date = nextWeekday(1); // Monday — open by default
    await expect(
      useCase.execute({
        date,
        startTime: '09:00',
        endTime: '14:00',
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      }),
    ).rejects.toThrow(DayAlreadyOpenInSettingsError);
  });

  it('throws ScheduleOpeningAlreadyExistsError when opening already exists', async () => {
    const date = nextWeekday(0);
    await repo.save(new ScheduleOpeningBuilder().withTenantId(TENANT_ID).withDate(date).build());

    await expect(
      useCase.execute({
        date,
        startTime: '09:00',
        endTime: '14:00',
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      }),
    ).rejects.toThrow(ScheduleOpeningAlreadyExistsError);
  });

  it('saves optional notes when provided', async () => {
    const date = nextWeekday(0);
    const result = await useCase.execute({
      date,
      startTime: '09:00',
      endTime: '14:00',
      notes: 'Special event',
      tenantId: TENANT_ID,
      createdBy: ACTOR_ID,
      businessHours: settings.businessHours,
    });

    expect(result.notes).toBe('Special event');
  });

  describe('resourceId (M21 Cluster 1)', () => {
    it('creates a resource-scoped opening when resourceId belongs to the tenant and a tenant-wide opening already covers the window', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await resourceRepo.save(resource);
      const date = nextWeekday(0);

      await useCase.execute({
        date,
        startTime: '09:00',
        endTime: '14:00',
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      });

      const result = await useCase.execute({
        date,
        startTime: '09:00',
        endTime: '14:00',
        resourceId: resource.id,
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      });

      expect(result.resourceId).toBe(resource.id);
    });

    it('throws ResourceNotFoundError when resourceId does not exist', async () => {
      await expect(
        useCase.execute({
          date: nextWeekday(0),
          startTime: '09:00',
          endTime: '14:00',
          resourceId: '00000000-0000-7000-8000-000000000099',
          tenantId: TENANT_ID,
          createdBy: ACTOR_ID,
          businessHours: settings.businessHours,
        }),
      ).rejects.toThrow(ResourceNotFoundError);
    });

    it('throws ResourceNotFoundError when resourceId belongs to another tenant', async () => {
      const resource = new ResourceBuilder().withTenantId(OTHER_TENANT_ID).build();
      await resourceRepo.save(resource);

      await expect(
        useCase.execute({
          date: nextWeekday(0),
          startTime: '09:00',
          endTime: '14:00',
          resourceId: resource.id,
          tenantId: TENANT_ID,
          createdBy: ACTOR_ID,
          businessHours: settings.businessHours,
        }),
      ).rejects.toThrow(ResourceNotFoundError);
    });

    it('a tenant-wide opening and a resource-scoped opening on the same date do not collide', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await resourceRepo.save(resource);
      const date = nextWeekday(0);

      await useCase.execute({
        date,
        startTime: '09:00',
        endTime: '14:00',
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      });

      const scoped = await useCase.execute({
        date,
        startTime: '09:00',
        endTime: '14:00',
        resourceId: resource.id,
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      });

      expect(scoped.id).toBeDefined();
    });

    it('two resource-scoped openings for the same resource/date still collide', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await resourceRepo.save(resource);
      const date = nextWeekday(0);

      await useCase.execute({
        date,
        startTime: '09:00',
        endTime: '14:00',
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      });

      await useCase.execute({
        date,
        startTime: '09:00',
        endTime: '14:00',
        resourceId: resource.id,
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      });

      await expect(
        useCase.execute({
          date,
          startTime: '10:00',
          endTime: '12:00',
          resourceId: resource.id,
          tenantId: TENANT_ID,
          createdBy: ACTOR_ID,
          businessHours: settings.businessHours,
        }),
      ).rejects.toThrow(ScheduleOpeningAlreadyExistsError);
    });
  });

  describe('resource workingHours precedence (M21 Cluster 1, Codex PR #460 round-1 finding)', () => {
    it("allows opening a day closed only in the resource's own workingHours, even though the tenant is open that day", async () => {
      const monday = nextWeekday(1); // open in tenant businessHours by default
      const resourceWorkingHours = {
        ...settings.businessHours,
        monday: null, // this resource specifically doesn't work Mondays
      };
      const resource = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withTenantBusinessHours(settings.businessHours)
        .withWorkingHours(resourceWorkingHours)
        .build();
      await resourceRepo.save(resource);

      const result = await useCase.execute({
        date: monday,
        startTime: '09:00',
        endTime: '12:00',
        resourceId: resource.id,
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      });

      expect(result.resourceId).toBe(resource.id);
    });

    it('rejects opening a day the resource is still open on, even for a resource with its own workingHours', async () => {
      const monday = nextWeekday(1);
      const resourceWorkingHours = {
        ...settings.businessHours,
        monday: { open: '09:00', close: '18:00' }, // this resource does work Mondays
      };
      const resource = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withTenantBusinessHours(settings.businessHours)
        .withWorkingHours(resourceWorkingHours)
        .build();
      await resourceRepo.save(resource);

      await expect(
        useCase.execute({
          date: monday,
          startTime: '09:00',
          endTime: '12:00',
          resourceId: resource.id,
          tenantId: TENANT_ID,
          createdBy: ACTOR_ID,
          businessHours: settings.businessHours,
        }),
      ).rejects.toThrow(DayAlreadyOpenInSettingsError);
    });

    it('falls back to tenant businessHours when the resource has no workingHours of its own', async () => {
      const sunday = nextWeekday(0); // closed in tenant businessHours by default
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build(); // workingHours: null
      await resourceRepo.save(resource);

      // Sunday is closed for the tenant, so a resource-scoped opening needs an explicit
      // tenant-wide opening to bound against first (see the tenant-window-bound describe
      // block below).
      await useCase.execute({
        date: sunday,
        startTime: '09:00',
        endTime: '12:00',
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      });

      const result = await useCase.execute({
        date: sunday,
        startTime: '09:00',
        endTime: '12:00',
        resourceId: resource.id,
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      });

      expect(result.resourceId).toBe(resource.id);
    });
  });

  describe('tenant-window bound (M21 Cluster 1, Codex PR #460 round-2 finding)', () => {
    it('rejects a resource-scoped window that extends beyond an existing tenant-wide opening', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await resourceRepo.save(resource);
      const date = nextWeekday(0);

      await useCase.execute({
        date,
        startTime: '09:00',
        endTime: '18:00',
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      });

      await expect(
        useCase.execute({
          date,
          startTime: '08:00', // before the tenant-wide window's start
          endTime: '19:00', // after the tenant-wide window's end
          resourceId: resource.id,
          tenantId: TENANT_ID,
          createdBy: ACTOR_ID,
          businessHours: settings.businessHours,
        }),
      ).rejects.toThrow(OpeningExceedsTenantWindowError);
    });

    it('allows a resource-scoped window that is a strict subset of an existing tenant-wide opening', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await resourceRepo.save(resource);
      const date = nextWeekday(0);

      await useCase.execute({
        date,
        startTime: '09:00',
        endTime: '18:00',
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      });

      const scoped = await useCase.execute({
        date,
        startTime: '10:00',
        endTime: '12:00',
        resourceId: resource.id,
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      });

      expect(scoped.resourceId).toBe(resource.id);
    });

    it('throws TenantOpeningRequiredError when the day is closed for the tenant and no tenant-wide opening exists yet (M21 Cluster 1, Codex PR #460 round-3 finding)', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await resourceRepo.save(resource);
      const date = nextWeekday(0); // Sunday — closed for the tenant, no implicit window to bound against

      await expect(
        useCase.execute({
          date,
          startTime: '09:00',
          endTime: '14:00',
          resourceId: resource.id,
          tenantId: TENANT_ID,
          createdBy: ACTOR_ID,
          businessHours: settings.businessHours,
        }),
      ).rejects.toThrow(TenantOpeningRequiredError);
    });

    it('does not require an explicit tenant-wide opening when the day is normally open for the tenant (round-1 scenario stays reachable)', async () => {
      const monday = nextWeekday(1); // open in tenant businessHours by default
      const resourceWorkingHours = {
        ...settings.businessHours,
        monday: null, // this resource specifically doesn't work Mondays
      };
      const resource = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withTenantBusinessHours(settings.businessHours)
        .withWorkingHours(resourceWorkingHours)
        .build();
      await resourceRepo.save(resource);

      // No tenant-wide opening created for this Monday — and none could be, since Monday is
      // already open for the tenant (DayAlreadyOpenInSettingsError). The tenant's own
      // businessHours window (09:00-18:00) is the implicit bound instead.
      const result = await useCase.execute({
        date: monday,
        startTime: '10:00',
        endTime: '12:00',
        resourceId: resource.id,
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      });

      expect(result.resourceId).toBe(resource.id);
    });

    it('rejects a resource-scoped window exceeding the tenant businessHours window on a day the tenant is normally open', async () => {
      const monday = nextWeekday(1);
      const resourceWorkingHours = {
        ...settings.businessHours,
        monday: null,
      };
      const resource = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withTenantBusinessHours(settings.businessHours)
        .withWorkingHours(resourceWorkingHours)
        .build();
      await resourceRepo.save(resource);

      await expect(
        useCase.execute({
          date: monday,
          startTime: '08:00', // before businessHours.monday.open (09:00)
          endTime: '12:00',
          resourceId: resource.id,
          tenantId: TENANT_ID,
          createdBy: ACTOR_ID,
          businessHours: settings.businessHours,
        }),
      ).rejects.toThrow(OpeningExceedsTenantWindowError);
    });

    it('does not bound a tenant-wide opening against anything (only resource-scoped ones are bounded)', async () => {
      const date = nextWeekday(0);

      const result = await useCase.execute({
        date,
        startTime: '00:00',
        endTime: '23:59',
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      });

      expect(result.resourceId).toBeNull();
    });
  });

  describe('tenant-day advisory lock (M21 Cluster 1, Codex PR #460 round-4 TOCTOU finding)', () => {
    it('acquires the (tenantId, date) lock before creating a resource-scoped opening', async () => {
      const monday = nextWeekday(1); // open in tenant businessHours by default
      const resourceWorkingHours = {
        ...settings.businessHours,
        monday: null, // this resource specifically doesn't work Mondays
      };
      const resource = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withTenantBusinessHours(settings.businessHours)
        .withWorkingHours(resourceWorkingHours)
        .build();
      await resourceRepo.save(resource);
      const lockSpy = jest.spyOn(tenantDayLock, 'lockTenantDay');

      await useCase.execute({
        date: monday,
        startTime: '10:00',
        endTime: '12:00',
        resourceId: resource.id,
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      });

      expect(lockSpy).toHaveBeenCalledWith(TENANT_ID, monday);
    });

    it('does not acquire the lock when creating a tenant-wide opening', async () => {
      const date = nextWeekday(0);
      const lockSpy = jest.spyOn(tenantDayLock, 'lockTenantDay');

      await useCase.execute({
        date,
        startTime: '09:00',
        endTime: '14:00',
        tenantId: TENANT_ID,
        createdBy: ACTOR_ID,
        businessHours: settings.businessHours,
      });

      expect(lockSpy).not.toHaveBeenCalled();
    });
  });
});
