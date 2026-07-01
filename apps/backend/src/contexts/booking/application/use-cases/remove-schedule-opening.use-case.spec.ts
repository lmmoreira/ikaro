import { futureDate } from '../../../../test/utils/date-helpers';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { ScheduleOpeningBuilder } from '../../../../test/builders/booking/schedule-opening.builder';
import { RemoveScheduleOpeningUseCase } from './remove-schedule-opening.use-case';
import { ScheduleOpeningNotFoundError } from '../../domain/errors/booking-domain.error';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '00000000-0000-7000-8000-000000000099';

describe('RemoveScheduleOpeningUseCase', () => {
  let repo: InMemoryScheduleOpeningRepository;
  let useCase: RemoveScheduleOpeningUseCase;

  beforeEach(() => {
    repo = new InMemoryScheduleOpeningRepository();
    const tx = new InMemoryTransactionManager();
    useCase = new RemoveScheduleOpeningUseCase(repo, tx);
  });

  it('deletes an existing opening', async () => {
    const opening = new ScheduleOpeningBuilder()
      .withTenantId(TENANT_ID)
      .withDate(futureDate(5))
      .build();
    await repo.save(opening);

    await useCase.execute({ id: opening.id, tenantId: TENANT_ID });

    const stored = await repo.findById(opening.id, TENANT_ID);
    expect(stored).toBeNull();
  });

  it('throws ScheduleOpeningNotFoundError for unknown id', async () => {
    await expect(
      useCase.execute({ id: '00000000-0000-7000-8000-000000000099', tenantId: TENANT_ID }),
    ).rejects.toThrow(ScheduleOpeningNotFoundError);
  });

  it('throws ScheduleOpeningNotFoundError for opening belonging to another tenant', async () => {
    const opening = new ScheduleOpeningBuilder()
      .withTenantId(OTHER_TENANT_ID)
      .withDate(futureDate(5))
      .build();
    await repo.save(opening);

    await expect(useCase.execute({ id: opening.id, tenantId: TENANT_ID })).rejects.toThrow(
      ScheduleOpeningNotFoundError,
    );
  });
});
