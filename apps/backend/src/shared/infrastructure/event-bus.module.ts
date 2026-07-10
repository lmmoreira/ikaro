import { Global, Module } from '@nestjs/common';
import { EVENT_BUS } from '../ports/event-bus.port';
import { TRIGGER_BUS } from '../ports/trigger-bus.port';
import { PUSHABLE_EVENT_BUS } from '../ports/pushable-event-bus.port';
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
    { provide: EVENT_BUS, useClass: GcpPubSubEventBusAdapter },
    // Token-to-token aliases, not the useExisting-adapter-token anti-pattern from CLAUDE.md §8 —
    // that pattern is `{ provide: TOKEN, useExisting: SomeClass }` where SomeClass is *also* a
    // bare provider, double-instantiating it. EVENT_BUS here is a token (Symbol), not a class —
    // GcpPubSubEventBusAdapter is registered exactly once, above. TRIGGER_BUS/PUSHABLE_EVENT_BUS
    // resolve to whatever EVENT_BUS resolves to (same singleton), and correctly follow EVENT_BUS
    // overrides in tests too.
    { provide: TRIGGER_BUS, useExisting: EVENT_BUS },
    { provide: PUSHABLE_EVENT_BUS, useExisting: EVENT_BUS },
  ],
  exports: [EVENT_BUS, TRIGGER_BUS, PUSHABLE_EVENT_BUS],
})
export class EventBusModule {}
