import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { ScheduleClosureBuilder } from '../../../../test/builders/booking/index';
import { ListClosuresUseCase } from './list-closures.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT = '99999999-0000-7000-8000-000000000099';

describe('ListClosuresUseCase', () => {
  let repo: InMemoryScheduleClosureRepository;
  let useCase: ListClosuresUseCase;

  beforeEach(() => {
    repo = new InMemoryScheduleClosureRepository();
    useCase = new ListClosuresUseCase(repo);
  });

  it('returns closures in the requested date range sorted by date', async () => {
    await repo.save(
      new ScheduleClosureBuilder().withTenantId(TENANT_ID).withDate('2026-12-25').build(),
    );
    await repo.save(
      new ScheduleClosureBuilder().withTenantId(TENANT_ID).withDate('2026-12-20').build(),
    );

    const { items } = await useCase.execute({
      from: '2026-12-01',
      to: '2026-12-31',
      tenantId: TENANT_ID,
    });

    expect(items).toHaveLength(2);
    expect(items[0].date).toBe('2026-12-20');
    expect(items[1].date).toBe('2026-12-25');
  });

  it('returns empty list when no closures in range', async () => {
    const { items } = await useCase.execute({
      from: '2026-11-01',
      to: '2026-11-30',
      tenantId: TENANT_ID,
    });
    expect(items).toHaveLength(0);
  });

  it('does not return closures outside the date range', async () => {
    await repo.save(
      new ScheduleClosureBuilder().withTenantId(TENANT_ID).withDate('2026-12-25').build(),
    );

    const { items } = await useCase.execute({
      from: '2026-11-01',
      to: '2026-11-30',
      tenantId: TENANT_ID,
    });
    expect(items).toHaveLength(0);
  });

  it('does not return closures from another tenant', async () => {
    await repo.save(
      new ScheduleClosureBuilder().withTenantId(OTHER_TENANT).withDate('2026-12-25').build(),
    );

    const { items } = await useCase.execute({
      from: '2026-12-01',
      to: '2026-12-31',
      tenantId: TENANT_ID,
    });
    expect(items).toHaveLength(0);
  });

  it('serializes startTime/endTime as strings when partial closure', async () => {
    await repo.save(
      new ScheduleClosureBuilder()
        .withTenantId(TENANT_ID)
        .withDate('2026-12-25')
        .withStartTime('10:00')
        .withEndTime('12:00')
        .build(),
    );

    const { items } = await useCase.execute({
      from: '2026-12-01',
      to: '2026-12-31',
      tenantId: TENANT_ID,
    });
    expect(items[0].startTime).toBe('10:00');
    expect(items[0].endTime).toBe('12:00');
  });

  it('serializes startTime/endTime as null for full-day closure', async () => {
    await repo.save(
      new ScheduleClosureBuilder().withTenantId(TENANT_ID).withDate('2026-12-25').build(),
    );

    const { items } = await useCase.execute({
      from: '2026-12-01',
      to: '2026-12-31',
      tenantId: TENANT_ID,
    });
    expect(items[0].startTime).toBeNull();
    expect(items[0].endTime).toBeNull();
  });
});
