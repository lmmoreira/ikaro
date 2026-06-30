import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { ScheduleOpeningBuilder } from '../../../../test/builders/booking/schedule-opening.builder';
import { ListOpeningsUseCase } from './list-openings.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';

describe('ListOpeningsUseCase', () => {
  let repo: InMemoryScheduleOpeningRepository;
  let useCase: ListOpeningsUseCase;

  beforeEach(() => {
    repo = new InMemoryScheduleOpeningRepository();
    useCase = new ListOpeningsUseCase(repo);
  });

  it('returns items within the requested date range', async () => {
    await repo.save(
      new ScheduleOpeningBuilder().withTenantId(TENANT_ID).withDate('2026-12-28').build(),
    );
    await repo.save(
      new ScheduleOpeningBuilder().withTenantId(TENANT_ID).withDate('2026-12-21').build(),
    );

    const result = await useCase.execute({ from: '2026-12-01', to: '2026-12-31', tenantId: TENANT_ID });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].date).toBe('2026-12-21');
    expect(result.items[1].date).toBe('2026-12-28');
  });

  it('returns empty list when no openings in range', async () => {
    const result = await useCase.execute({ from: '2026-11-01', to: '2026-11-30', tenantId: TENANT_ID });
    expect(result.items).toHaveLength(0);
  });

  it('excludes openings from other tenants', async () => {
    await repo.save(
      new ScheduleOpeningBuilder()
        .withTenantId('00000000-0000-7000-8000-000000000099')
        .withDate('2026-12-28')
        .build(),
    );

    const result = await useCase.execute({ from: '2026-12-01', to: '2026-12-31', tenantId: TENANT_ID });
    expect(result.items).toHaveLength(0);
  });
});
