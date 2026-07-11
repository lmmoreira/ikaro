import { Global, Module } from '@nestjs/common';
import { EVENT_BUS } from '../../ports/event-bus.port';
import { TRIGGER_BUS } from '../../ports/trigger-bus.port';
import { PUSHABLE_EVENT_BUS } from '../../ports/pushable-event-bus.port';
import { GcpPubSubEventBusAdapter } from './gcp-pubsub-event-bus.adapter';

// @Global makes EVENT_BUS/TRIGGER_BUS/PUSHABLE_EVENT_BUS injectable in every context module
// without an explicit import. This module is imported once in AppModule. In local dev and
// integration tests it connects to the GCP Pub/Sub emulator via PUBSUB_EMULATOR_HOST; in
// production it uses real GCP. All three aliases live here, not just in AppModule, so any
// context module or standalone test harness that needs one of these ports resolves it without
// having to import AppModule — PubSubPushController (the only current PUSHABLE_EVENT_BUS
// consumer) happens to be registered in AppModule too, but that's incidental, not a dependency.
@Global()
@Module({
  providers: [
    // EVENT_BUS remains the ONE owning definition (useClass) — GcpPubSubEventBusAdapter is
    // instantiated exactly once, here.
    { provide: EVENT_BUS, useClass: GcpPubSubEventBusAdapter },
    // Token-to-token aliases, not the useExisting-adapter-token anti-pattern from CLAUDE.md §8
    // ("useExisting still instantiates the class even when the token is overridden in tests").
    // That anti-pattern is `{ provide: TOKEN, useExisting: SomeClass }` where SomeClass is ALSO
    // registered as its own bare provider — overriding TOKEN in a test then leaves the bare
    // class provider behind, still instantiated. Every alias below points at EVENT_BUS itself
    // (a Symbol token, not a class) and nothing here registers GcpPubSubEventBusAdapter as a
    // second, independent provider — so overriding EVENT_BUS in tests correctly cascades to
    // every alias, with no stray real instance left over.
    { provide: TRIGGER_BUS, useExisting: EVENT_BUS },
    { provide: PUSHABLE_EVENT_BUS, useExisting: EVENT_BUS },
  ],
  exports: [EVENT_BUS, TRIGGER_BUS, PUSHABLE_EVENT_BUS],
})
export class EventBusModule {}
