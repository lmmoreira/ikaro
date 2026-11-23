import { ProviderEventBuilder } from '../../../../test/builders/billing';
import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import { InMemoryProviderEventRepository } from '../../../../test/repositories/billing/in-memory-provider-event.repository';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  PROVIDER_EVENT_RETENTION_DAYS,
  PROVIDER_EVENTS_PURGE_BATCH_SIZE,
  PROVIDER_EVENTS_PURGE_MAX_BATCHES,
} from '../../domain/billing-constants';
import { PurgeProviderEventsUseCase } from './purge-provider-events.use-case';

const NOW = new Date('2026-03-10T15:00:00Z');
const RETENTION_MS = PROVIDER_EVENT_RETENTION_DAYS * 86_400_000;
const CAP = PROVIDER_EVENTS_PURGE_BATCH_SIZE * PROVIDER_EVENTS_PURGE_MAX_BATCHES;
const CORRELATION_ID = '00000000-0000-7000-8000-0000000000aa';

describe('PurgeProviderEventsUseCase (UC-114 retention)', () => {
  let events: InMemoryProviderEventRepository;
  let useCase: PurgeProviderEventsUseCase;

  const seed = (count: number, receivedAt: Date): void => {
    for (let i = 0; i < count; i += 1) {
      events.saved.push(new ProviderEventBuilder().withReceivedAt(receivedAt).build());
    }
  };

  beforeEach(() => {
    events = new InMemoryProviderEventRepository();
    useCase = new PurgeProviderEventsUseCase(events, new FixedClock(NOW));
  });

  afterEach(() => jest.restoreAllMocks());

  it('deletes a row 30 days and one second old and keeps one at exactly 30 days', async () => {
    const old = new ProviderEventBuilder()
      .withReceivedAt(new Date(NOW.getTime() - RETENTION_MS - 1000))
      .build();
    const boundary = new ProviderEventBuilder()
      .withReceivedAt(new Date(NOW.getTime() - RETENTION_MS))
      .build();
    events.saved.push(old, boundary);

    const result = await useCase.execute({ correlationId: CORRELATION_ID });

    expect(result).toEqual({ deleted: 1, batches: 1, limitHit: false });
    expect(events.saved).toEqual([boundary]);
  });

  it('keeps every newer row', async () => {
    seed(3, new Date(NOW.getTime() - 24 * 3_600_000));

    await expect(useCase.execute({ correlationId: CORRELATION_ID })).resolves.toEqual({
      deleted: 0,
      batches: 1,
      limitHit: false,
    });
    expect(events.saved).toHaveLength(3);
  });

  it('on an empty inbox runs one batch and stops', async () => {
    await expect(useCase.execute({ correlationId: CORRELATION_ID })).resolves.toEqual({
      deleted: 0,
      batches: 1,
      limitHit: false,
    });
  });

  it('loops while a batch is full and stops after the first partial batch', async () => {
    seed(PROVIDER_EVENTS_PURGE_BATCH_SIZE + 5, new Date(NOW.getTime() - RETENTION_MS - 1000));

    const result = await useCase.execute({ correlationId: CORRELATION_ID });

    expect(result).toEqual({
      deleted: PROVIDER_EVENTS_PURGE_BATCH_SIZE + 5,
      batches: 2,
      limitHit: false,
    });
    expect(events.saved).toHaveLength(0);
  });

  it('stops at the per-run batch limit and reports it; the next run continues', async () => {
    seed(CAP + 500, new Date(NOW.getTime() - RETENTION_MS - 1000));

    const first = await useCase.execute({ correlationId: CORRELATION_ID });
    expect(first).toEqual({
      deleted: CAP,
      batches: PROVIDER_EVENTS_PURGE_MAX_BATCHES,
      limitHit: true,
    });
    expect(events.saved).toHaveLength(500);

    const second = await useCase.execute({ correlationId: CORRELATION_ID });
    expect(second).toEqual({ deleted: 500, batches: 1, limitHit: false });
    expect(events.saved).toHaveLength(0);
  });

  it('a run that ends exactly on the limit with a full last batch still reports the limit hit', async () => {
    seed(CAP, new Date(NOW.getTime() - RETENTION_MS - 1000));

    await expect(useCase.execute({ correlationId: CORRELATION_ID })).resolves.toEqual({
      deleted: CAP,
      batches: PROVIDER_EVENTS_PURGE_MAX_BATCHES,
      limitHit: true,
    });
  });

  it('logs the one billing_provider_events_purge_run line with the counts', async () => {
    const log = jest.spyOn(AppLogger.prototype, 'log').mockImplementation(() => undefined);
    seed(2, new Date(NOW.getTime() - RETENTION_MS - 1000));

    await useCase.execute({ correlationId: CORRELATION_ID });

    expect(log).toHaveBeenCalledWith('billing_provider_events_purge_run', {
      deleted: 2,
      batches: 1,
      limitHit: false,
      batchSize: PROVIDER_EVENTS_PURGE_BATCH_SIZE,
      maxBatches: PROVIDER_EVENTS_PURGE_MAX_BATCHES,
      correlationId: CORRELATION_ID,
    });
  });

  it('propagates a repository failure so the trigger is nacked', async () => {
    jest.spyOn(events, 'deleteOlderThanBatch').mockRejectedValue(new Error('db down'));

    await expect(useCase.execute({ correlationId: CORRELATION_ID })).rejects.toThrow('db down');
  });
});
