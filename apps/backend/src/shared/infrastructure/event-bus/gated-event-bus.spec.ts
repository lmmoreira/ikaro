import { Envelope } from '../../domain/envelope';
import { InMemoryEventBus } from '../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTenantAccessPort } from '../../../test/infrastructure/in-memory-tenant-access.port';
import { SubscribeOptions } from '../../ports/event-bus.port';
import { GatedEventBus } from './gated-event-bus';

class DemoEvent extends Envelope {
  readonly eventVersion = 1;
  readonly data = {};

  constructor(tenantId: string) {
    super(tenantId, 'correlation-1');
  }
}

const TENANT_A = '0190b1a0-0000-7000-8000-00000000000a';
const TENANT_B = '0190b1a0-0000-7000-8000-00000000000b';

describe('GatedEventBus', () => {
  let transport: InMemoryEventBus;
  let access: InMemoryTenantAccessPort;
  let gated: GatedEventBus;
  let delivered: string[];

  // Registers a handler through the gate and returns what the transport would call on delivery.
  function register(options?: SubscribeOptions): (event: Envelope) => Promise<void> {
    gated.subscribe(
      DemoEvent.name,
      async (event: DemoEvent) => {
        delivered.push(event.tenantId);
      },
      'demo-consumer',
      options,
    );
    return transport.subscriptions[transport.subscriptions.length - 1].handler;
  }

  beforeEach(() => {
    transport = new InMemoryEventBus();
    access = new InMemoryTenantAccessPort();
    gated = new GatedEventBus(transport, access);
    delivered = [];
  });

  describe('the default is to run', () => {
    it('registers a handler with no options as-is and never asks the access port', async () => {
      const handler = register();
      access.seedSuspended(TENANT_A);

      await handler(new DemoEvent(TENANT_A));

      expect(delivered).toEqual([TENANT_A]);
      expect(access.getAccessCalls).toEqual([]);
    });

    it('hands the transport the very same handler when nothing is asked of it', () => {
      const own = async (): Promise<void> => undefined;

      gated.subscribe(DemoEvent.name, own, 'demo-consumer');
      gated.subscribe(DemoEvent.name, own, 'demo-consumer', { skipWhenSuspended: false });

      expect(transport.subscriptions[0].handler).toBe(own);
      expect(transport.subscriptions[1].handler).toBe(own);
    });

    it('registers skipWhenSuspended: false without a lookup, even for a suspended tenant', async () => {
      const handler = register({ skipWhenSuspended: false });
      access.seedSuspended(TENANT_A);

      await handler(new DemoEvent(TENANT_A));

      expect(delivered).toEqual([TENANT_A]);
      expect(access.getAccessCalls).toEqual([]);
    });
  });

  describe('skipWhenSuspended: true', () => {
    it('skips and acknowledges the event of a suspended tenant', async () => {
      const handler = register({ skipWhenSuspended: true });
      access.seedSuspended(TENANT_A);

      await expect(handler(new DemoEvent(TENANT_A))).resolves.toBeUndefined();

      expect(delivered).toEqual([]);
    });

    it('delivers the event of an operational tenant', async () => {
      const handler = register({ skipWhenSuspended: true });

      await handler(new DemoEvent(TENANT_A));

      expect(delivered).toEqual([TENANT_A]);
    });

    it("asks once per delivery, with the event's own tenant id", async () => {
      const handler = register({ skipWhenSuspended: true });

      await handler(new DemoEvent(TENANT_A));

      expect(access.getAccessCalls).toEqual([TENANT_A]);
    });

    it('lets a PAST_DUE tenant through (it is still operational)', async () => {
      const handler = register({ skipWhenSuspended: true });
      access.seed(TENANT_A, {
        status: 'PAST_DUE',
        suspensionReason: null,
        operational: true,
        features: [{ key: 'BOOKING', tier: 'STANDARD' }],
      });

      await handler(new DemoEvent(TENANT_A));

      expect(delivered).toEqual([TENANT_A]);
    });

    it("never lets tenant A's suspension skip tenant B's event", async () => {
      const handler = register({ skipWhenSuspended: true });
      access.seedSuspended(TENANT_A);

      await handler(new DemoEvent(TENANT_A));
      await handler(new DemoEvent(TENANT_B));

      expect(delivered).toEqual([TENANT_B]);
    });
  });

  describe('requires', () => {
    it('skips a tenant that lacks the feature', async () => {
      const handler = register({ requires: 'LOYALTY', skipWhenSuspended: true });
      access.seed(TENANT_A, {
        status: 'ACTIVE',
        suspensionReason: null,
        operational: true,
        features: [{ key: 'BOOKING', tier: 'STANDARD' }],
      });

      await handler(new DemoEvent(TENANT_A));

      expect(delivered).toEqual([]);
    });

    it('delivers for a tenant entitled to the feature', async () => {
      const handler = register({ requires: 'LOYALTY', skipWhenSuspended: true });

      await handler(new DemoEvent(TENANT_A));

      expect(delivered).toEqual([TENANT_A]);
    });

    it('skips a suspended tenant even though it lists the feature', async () => {
      const handler = register({ requires: 'LOYALTY', skipWhenSuspended: false });
      access.seed(TENANT_A, {
        status: 'SUSPENDED',
        suspensionReason: 'NON_PAYMENT',
        operational: false,
        features: [{ key: 'LOYALTY', tier: 'STANDARD' }],
      });

      await handler(new DemoEvent(TENANT_A));

      expect(delivered).toEqual([]);
    });

    it('does one lookup when both options are set', async () => {
      const handler = register({ requires: 'LOYALTY', skipWhenSuspended: true });

      await handler(new DemoEvent(TENANT_A));

      expect(access.getAccessCalls).toEqual([TENANT_A]);
    });
  });

  describe('fails open', () => {
    it('runs the handler when the lookup throws', async () => {
      const handler = register({ skipWhenSuspended: true });
      access.getAccessError = new Error('database unreachable');

      await handler(new DemoEvent(TENANT_A));

      expect(delivered).toEqual([TENANT_A]);
    });

    it('runs the handler for an envelope with no tenant id, without a lookup', async () => {
      const handler = register({ skipWhenSuspended: true });

      await handler(new DemoEvent(''));

      expect(delivered).toEqual(['']);
      expect(access.getAccessCalls).toEqual([]);
    });

    it('lets a provisional (trial-shaped) answer through', async () => {
      const handler = register({ requires: 'BOOKING', skipWhenSuspended: true });
      access.seed(TENANT_A, {
        status: 'TRIALING',
        suspensionReason: null,
        operational: true,
        features: [{ key: 'BOOKING', tier: 'STANDARD' }],
        provisional: true,
      });

      await handler(new DemoEvent(TENANT_A));

      expect(delivered).toEqual([TENANT_A]);
    });
  });

  describe('delegation', () => {
    it("propagates the handler's own error unchanged, so nack and the DLQ still work", async () => {
      gated.subscribe(
        DemoEvent.name,
        async () => {
          throw new Error('handler failed');
        },
        'demo-consumer',
        { skipWhenSuspended: true },
      );
      const handler = transport.subscriptions[0].handler;

      await expect(handler(new DemoEvent(TENANT_A))).rejects.toThrow('handler failed');
    });

    it('forwards the event name and consumer name to the transport', () => {
      register({ skipWhenSuspended: true });

      expect(transport.subscriptions[0]).toMatchObject({
        eventName: DemoEvent.name,
        consumerName: 'demo-consumer',
      });
    });

    it('forwards publish to the transport untouched', async () => {
      const event = new DemoEvent(TENANT_A);

      await gated.publish(event);

      expect(transport.published).toEqual([event]);
    });
  });
});
