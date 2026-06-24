import { pastDate, nextWeekday } from '../../../../test/utils/date-helpers';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { ScheduleOpeningBuilder } from '../../../../test/builders/booking/schedule-opening.builder';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { OpenScheduleUseCase } from './open-schedule.use-case';
import {
  DayAlreadyOpenInSettingsError,
  OpeningDateInPastError,
  ScheduleOpeningAlreadyExistsError,
} from '../../domain/errors/booking-domain.error';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const ACTOR_ID = '00000000-0000-7000-8000-000000000002';

describe('OpenScheduleUseCase', () => {
  let repo: InMemoryScheduleOpeningRepository;
  let useCase: OpenScheduleUseCase;

  beforeEach(() => {
    repo = new InMemoryScheduleOpeningRepository();
    const ctx = new RequestContextBuilder().withTenantId(TENANT_ID).withActorId(ACTOR_ID).build();
    const tx = new InMemoryTransactionManager();
    useCase = new OpenScheduleUseCase(repo, tx, ctx);
  });

  it('creates an opening for a normally-closed day', async () => {
    const date = nextWeekday(0); // Sunday — closed by default
    const result = await useCase.execute({ date, startTime: '09:00', endTime: '14:00' });

    expect(result.id).toBeDefined();
    expect(result.date).toBe(date);
    expect(result.startTime).toBe('09:00');
    expect(result.endTime).toBe('14:00');
    expect(result.createdBy).toBe(ACTOR_ID);
  });

  it('stores the opening in the repository', async () => {
    const date = nextWeekday(0);
    await useCase.execute({ date, startTime: '10:00', endTime: '13:00' });

    const stored = await repo.findByTenantAndDate(TENANT_ID, date);
    expect(stored).not.toBeNull();
    expect(stored!.startTime.value).toBe('10:00');
  });

  it('throws OpeningDateInPastError for a past date', async () => {
    await expect(
      useCase.execute({ date: pastDate(1), startTime: '09:00', endTime: '14:00' }),
    ).rejects.toThrow(OpeningDateInPastError);
  });

  it('throws DayAlreadyOpenInSettingsError when day is open in businessHours', async () => {
    const date = nextWeekday(1); // Monday — open by default
    await expect(useCase.execute({ date, startTime: '09:00', endTime: '14:00' })).rejects.toThrow(
      DayAlreadyOpenInSettingsError,
    );
  });

  it('throws ScheduleOpeningAlreadyExistsError when opening already exists', async () => {
    const date = nextWeekday(0);
    await repo.save(new ScheduleOpeningBuilder().withTenantId(TENANT_ID).withDate(date).build());

    await expect(useCase.execute({ date, startTime: '09:00', endTime: '14:00' })).rejects.toThrow(
      ScheduleOpeningAlreadyExistsError,
    );
  });

  it('saves optional notes when provided', async () => {
    const date = nextWeekday(0);
    const result = await useCase.execute({
      date,
      startTime: '09:00',
      endTime: '14:00',
      notes: 'Special event',
    });

    expect(result.notes).toBe('Special event');
  });
});
