import { futureDate } from '../../../../test/utils/date-helpers';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { ScheduleOpeningBuilder } from '../../../../test/builders/booking/schedule-opening.builder';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { RemoveScheduleOpeningUseCase } from './remove-schedule-opening.use-case';
import { ScheduleOpeningNotFoundError } from '../../domain/errors/booking-domain.error';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '00000000-0000-7000-8000-000000000099';

describe('RemoveScheduleOpeningUseCase', () => {
  let repo: InMemoryScheduleOpeningRepository;
  let useCase: RemoveScheduleOpeningUseCase;

  beforeEach(() => {
    repo = new InMemoryScheduleOpeningRepository();
    const ctx = new RequestContextBuilder().withTenantId(TENANT_ID).build();
    const tx = new InMemoryTransactionManager();
    useCase = new RemoveScheduleOpeningUseCase(repo, tx, ctx);
  });

  it('deletes an existing opening', async () => {
    const opening = new ScheduleOpeningBuilder()
      .withTenantId(TENANT_ID)
      .withDate(futureDate(5))
      .build();
    await repo.save(opening);

    await useCase.execute(opening.id);

    const stored = await repo.findById(opening.id, TENANT_ID);
    expect(stored).toBeNull();
  });

  it('throws ScheduleOpeningNotFoundError for unknown id', async () => {
    await expect(useCase.execute('00000000-0000-7000-8000-000000000099')).rejects.toThrow(
      ScheduleOpeningNotFoundError,
    );
  });

  it('throws ScheduleOpeningNotFoundError for opening belonging to another tenant', async () => {
    const opening = new ScheduleOpeningBuilder()
      .withTenantId(OTHER_TENANT_ID)
      .withDate(futureDate(5))
      .build();
    await repo.save(opening);

    await expect(useCase.execute(opening.id)).rejects.toThrow(ScheduleOpeningNotFoundError);
  });
});
