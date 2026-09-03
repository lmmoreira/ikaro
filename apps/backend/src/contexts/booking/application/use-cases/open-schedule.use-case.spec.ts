import { pastDate, nextWeekday } from '../../../../test/utils/date-helpers';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ScheduleOpeningBuilder, ResourceBuilder } from '../../../../test/builders/booking/index';
import { TenantSettings } from '../../../platform/domain/value-objects/tenant-settings.vo';
import { OpenScheduleUseCase } from './open-schedule.use-case';
import {
  DayAlreadyOpenInSettingsError,
  OpeningDateInPastError,
  ScheduleOpeningAlreadyExistsError,
} from '../../domain/errors/booking-domain.error';
import { ResourceNotFoundError } from '../../domain/errors/resource.error';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const ACTOR_ID = '00000000-0000-7000-8000-000000000002';
const OTHER_TENANT_ID = '99999999-0000-7000-8000-000000000099';

describe('OpenScheduleUseCase', () => {
  let repo: InMemoryScheduleOpeningRepository;
  let resourceRepo: InMemoryResourceRepository;
  let useCase: OpenScheduleUseCase;
  let settings: TenantSettings;

  beforeEach(() => {
    repo = new InMemoryScheduleOpeningRepository();
    resourceRepo = new InMemoryResourceRepository();
    settings = TenantSettings.default();
    const tx = new InMemoryTransactionManager();
    useCase = new OpenScheduleUseCase(repo, resourceRepo, tx);
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
    it('creates a resource-scoped opening when resourceId belongs to the tenant', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await resourceRepo.save(resource);
      const date = nextWeekday(0);

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
});
