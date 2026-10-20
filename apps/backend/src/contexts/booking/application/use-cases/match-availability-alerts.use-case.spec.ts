import {
  AvailabilityAlertMatchingResult,
  AvailabilityAlertMatchingService,
} from '../services/availability-alert-matching.service';
import { MatchAvailabilityAlertsUseCase } from './match-availability-alerts.use-case';

describe('MatchAvailabilityAlertsUseCase', () => {
  it('delegates to AvailabilityAlertMatchingService and returns its result unchanged', async () => {
    const result: AvailabilityAlertMatchingResult = { notified: 2 };
    const match = jest.fn().mockResolvedValue(result);
    const useCase = new MatchAvailabilityAlertsUseCase({
      match,
    } as unknown as AvailabilityAlertMatchingService);
    const input = {
      tenantId: '00000000-0000-7000-8000-000000000001',
      correlationId: 'corr-1',
      serviceIds: ['00000000-0000-7000-8000-0000000000a1'],
      around: new Date('2026-11-02T10:00:00.000Z'),
    };

    await expect(useCase.execute(input)).resolves.toBe(result);
    expect(match).toHaveBeenCalledWith(input);
  });
});
