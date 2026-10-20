import {
  AvailabilityQueryResult,
  AvailabilityQueryService,
} from '../services/availability-query.service';
import { GetAvailabilityUseCase } from './get-availability.use-case';

describe('GetAvailabilityUseCase', () => {
  it('delegates to AvailabilityQueryService and returns its result unchanged', async () => {
    const result: AvailabilityQueryResult = { date: '2026-11-02', slots: [], available: false };
    const query = jest.fn().mockResolvedValue(result);
    const useCase = new GetAvailabilityUseCase({ query } as unknown as AvailabilityQueryService);
    const input = {
      tenantId: '00000000-0000-7000-8000-000000000001',
      date: '2026-11-02',
      serviceIds: ['00000000-0000-7000-8000-0000000000a1'],
    } as Parameters<GetAvailabilityUseCase['execute']>[0];

    await expect(useCase.execute(input)).resolves.toBe(result);
    expect(query).toHaveBeenCalledWith(input);
  });
});
