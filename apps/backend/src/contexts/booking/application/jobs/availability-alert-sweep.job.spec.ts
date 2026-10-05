import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { MatchAvailabilityAlertsUseCase } from '../use-cases/match-availability-alerts.use-case';
import { AvailabilityAlertSweepJob } from './availability-alert-sweep.job';

const SAO_PAULO_TENANT = '00000000-0000-7000-8000-000000000001'; // UTC-3
const TOKYO_TENANT = '00000000-0000-7000-8000-000000000002'; // UTC+9

describe('AvailabilityAlertSweepJob', () => {
  let platformPort: InMemoryBookingPlatformPort;
  let useCase: jest.Mocked<Pick<MatchAvailabilityAlertsUseCase, 'execute'>>;
  let job: AvailabilityAlertSweepJob;

  beforeEach(() => {
    platformPort = new InMemoryBookingPlatformPort();
    platformPort.seed([
      { id: SAO_PAULO_TENANT, timezone: 'America/Sao_Paulo' },
      { id: TOKYO_TENANT, timezone: 'Asia/Tokyo' },
    ]);
    useCase = { execute: jest.fn().mockResolvedValue({ notified: 2 }) };
    job = new AvailabilityAlertSweepJob(
      platformPort,
      useCase as unknown as MatchAvailabilityAlertsUseCase,
    );
  });

  it('sweeps a tenant once its local clock is inside 06:30–06:59, with every service and the whole window', async () => {
    // 09:30Z is 06:30 in São Paulo (and 18:30 in Tokyo).
    const now = new Date('2026-10-06T09:30:00.000Z');

    const result = await job.run(now);

    expect(result).toEqual({ tenantsSwept: 1, notified: 2 });
    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: SAO_PAULO_TENANT,
        serviceIds: null,
        around: null,
        now,
        correlationId: expect.any(String),
      }),
    );
  });

  it('includes the last minute of the window and excludes the minute before and after it', async () => {
    await job.run(new Date('2026-10-06T09:59:00.000Z')); // 06:59 São Paulo
    expect(useCase.execute).toHaveBeenCalledTimes(1);

    useCase.execute.mockClear();
    await job.run(new Date('2026-10-06T09:29:00.000Z')); // 06:29 São Paulo
    await job.run(new Date('2026-10-06T10:00:00.000Z')); // 07:00 São Paulo
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it("uses each tenant's own timezone: the same instant sweeps one tenant and skips the other", async () => {
    // 21:30Z is 06:30 the next day in Tokyo and 18:30 in São Paulo.
    await job.run(new Date('2026-10-06T21:30:00.000Z'));

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TOKYO_TENANT }),
    );
  });

  it('runs once per tenant per day: the 30-minute ticks outside the window do nothing', async () => {
    for (const tick of ['06:00', '07:00', '12:30', '18:00'] as const) {
      await job.run(new Date(`2026-10-06T${tick}:00.000Z`));
    }
    // 06:00Z, 07:00Z ... are 03:00/04:00/09:30/15:00 in São Paulo — none inside its window.
    expect(
      useCase.execute.mock.calls.filter(([input]) => input.tenantId === SAO_PAULO_TENANT),
    ).toHaveLength(0);
  });

  it('keeps sweeping the other tenants when one fails, and reports only what was notified', async () => {
    // Put both tenants in the same timezone so both are due at the same instant.
    platformPort.clear();
    platformPort.seed([
      { id: SAO_PAULO_TENANT, timezone: 'America/Sao_Paulo' },
      { id: TOKYO_TENANT, timezone: 'America/Sao_Paulo' },
    ]);
    useCase.execute.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ notified: 3 });

    const result = await job.run(new Date('2026-10-06T09:30:00.000Z'));

    expect(useCase.execute).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ tenantsSwept: 2, notified: 3 });
  });

  it('does nothing when there are no active tenants', async () => {
    platformPort.clear();

    expect(await job.run(new Date('2026-10-06T09:30:00.000Z'))).toEqual({
      tenantsSwept: 0,
      notified: 0,
    });
    expect(useCase.execute).not.toHaveBeenCalled();
  });
});
