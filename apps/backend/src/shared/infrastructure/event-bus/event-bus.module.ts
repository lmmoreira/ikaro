import { Global, Module } from '@nestjs/common';
import { EVENT_BUS, EVENT_BUS_TRANSPORT } from '../../ports/event-bus.port';
import { TRIGGER_BUS } from '../../ports/trigger-bus.port';
import { PUSHABLE_EVENT_BUS } from '../../ports/pushable-event-bus.port';
import { GatedEventBus } from './gated-event-bus';
import { GcpPubSubEventBusAdapter } from './gcp-pubsub-event-bus.adapter';

// @Global makes EVENT_BUS/TRIGGER_BUS/PUSHABLE_EVENT_BUS injectable in every context module
// without an explicit import. This module is imported once in AppModule. In local dev and
// integration tests it connects to the GCP Pub/Sub emulator via PUBSUB_EMULATOR_HOST; in
// production it uses real GCP. All three tokens live here, not just in AppModule, so any
// context module or standalone test harness that needs one of these ports resolves it without
// having to import AppModule — PubSubPushController (the only current PUSHABLE_EVENT_BUS
// consumer) happens to be registered in AppModule too, but that's incidental, not a dependency.
@Global()
@Module({
  providers: [
    // EVENT_BUS_TRANSPORT is the ONE owning definition (useClass) — GcpPubSubEventBusAdapter is
    // instantiated exactly once, here. A second instance would give the gate and the push
    // controller different handler registries.
    { provide: EVENT_BUS_TRANSPORT, useClass: GcpPubSubEventBusAdapter },
    // EVENT_BUS is what handlers inject: the decorator that applies a subscription's options
    // (M25-S21a). It sits above the transport, never inside it, so the transport has no
    // dependency on Billing's access port.
    { provide: EVENT_BUS, useClass: GatedEventBus },
    // Token-to-token aliases, not the useExisting-adapter-token anti-pattern from CLAUDE.md §8
    // ("useExisting still instantiates the class even when the token is overridden in tests").
    // That anti-pattern is `{ provide: TOKEN, useExisting: SomeClass }` where SomeClass is ALSO
    // registered as its own bare provider — overriding TOKEN in a test then leaves the bare
    // class provider behind, still instantiated. Every alias below points at EVENT_BUS_TRANSPORT
    // itself (a Symbol token, not a class) and nothing here registers GcpPubSubEventBusAdapter as
    // a second, independent provider — so overriding EVENT_BUS_TRANSPORT in tests correctly
    // cascades to every alias, with no stray real instance left over. They sit on the transport,
    // not on the gated bus: a cron trigger carries no envelope or tenant, and
    // dispatchPushMessage lives on the adapter (it still reaches the gate, because the wrapper is
    // applied when a handler is registered).
    { provide: TRIGGER_BUS, useExisting: EVENT_BUS_TRANSPORT },
    { provide: PUSHABLE_EVENT_BUS, useExisting: EVENT_BUS_TRANSPORT },
  ],
  exports: [EVENT_BUS, EVENT_BUS_TRANSPORT, TRIGGER_BUS, PUSHABLE_EVENT_BUS],
})
export class EventBusModule {}
