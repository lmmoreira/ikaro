import { BookingCompletedEventBuilder } from '../../../../test/builders/booking';
import { BookingCompleted } from '../../../booking/domain/events/booking-completed.event';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import { GatedEventBus } from '../../../../shared/infrastructure/event-bus/gated-event-bus';
import { CompleteBookingLoyaltyEffectsUseCase } from '../../application/use-cases/complete-booking-loyalty-effects/complete-booking-loyalty-effects.use-case';
import { BookingCompletedHandler } from './booking-completed.handler';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '00000000-0000-7000-8000-000000000002';

// UC-121 / UC-125 (M25-S21a): the loyalty earn handler is the one subscription in M25 that
// declares `requires`. It must not earn points while the tenant is suspended, nor for a tenant
// that is not entitled to LOYALTY, and must run for an entitled one. The real handler registers
// through the real GatedEventBus, so the declared options are what is under test.
describe('BookingCompletedHandler behind the event delivery gate', () => {
  let useCase: jest.Mocked<CompleteBookingLoyaltyEffectsUseCase>;
  let transport: InMemoryEventBus;
  let access: InMemoryTenantAccessPort;

  async function deliver(tenantId: string): Promise<BookingCompleted> {
    const event = new BookingCompletedEventBuilder().withTenantId(tenantId).build();
    await transport.subscriptions[0].handler(event);
    return event;
  }

  beforeEach(() => {
    // The handler takes the concrete use-case class, whose private dependencies a structural stub
    // cannot satisfy, so the repo's spec convention (see booking-completed.handler.spec.ts) is the
    // same narrow cast: only `execute` is ever called.
    useCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CompleteBookingLoyaltyEffectsUseCase>;
    transport = new InMemoryEventBus();
    access = new InMemoryTenantAccessPort();
    new BookingCompletedHandler(useCase, new GatedEventBus(transport, access)).onModuleInit();
  });

  it('earns for an entitled, operational tenant, forwarding the event ids to the use case', async () => {
    const event = await deliver(TENANT_ID);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        eventId: event.eventId,
        correlationId: event.correlationId,
      }),
    );
  });

  it('does not earn for a suspended tenant', async () => {
    access.seedSuspended(TENANT_ID);

    await deliver(TENANT_ID);

    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it('does not earn for an operational tenant that lacks LOYALTY', async () => {
    access.seed(TENANT_ID, {
      status: 'ACTIVE',
      suspensionReason: null,
      operational: true,
      features: [{ key: 'BOOKING', tier: 'STANDARD' }],
    });

    await deliver(TENANT_ID);

    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it("does not let another tenant's suspension stop this tenant's earning", async () => {
    access.seedSuspended(OTHER_TENANT_ID);

    await deliver(TENANT_ID);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
  });
});
