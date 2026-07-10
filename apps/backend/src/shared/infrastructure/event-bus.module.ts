import { Global, Module } from '@nestjs/common';
import { EVENT_BUS } from '../ports/event-bus.port';
import { TRIGGER_BUS } from '../ports/trigger-bus.port';
import { GcpPubSubEventBusAdapter } from './gcp-pubsub-event-bus.adapter';

// @Global makes EVENT_BUS/TRIGGER_BUS injectable in every context module without an explicit
// import. This module is imported once in AppModule. In local dev and integration tests it
// connects to the GCP Pub/Sub emulator via PUBSUB_EMULATOR_HOST; in production it uses real GCP.
// TRIGGER_BUS lives here (not just aliased in AppModule, unlike PUSHABLE_EVENT_BUS) because,
// unlike the push-dispatch port (only consumed by PubSubPushController in AppModule itself),
// trigger publishers/handlers are injected from inside context modules (BookingModule,
// LoyaltyModule) — those modules, and the standalone test harnesses that wire them without
// importing AppModule, need TRIGGER_BUS visible via this @Global module, same as EVENT_BUS.
@Global()
@Module({
  providers: [
    { provide: EVENT_BUS, useClass: GcpPubSubEventBusAdapter },
    // Token-to-token alias, not the useExisting-adapter-token anti-pattern from CLAUDE.md §8 —
    // that pattern is `{ provide: TOKEN, useExisting: SomeClass }` where SomeClass is *also* a
    // bare provider, double-instantiating it. EVENT_BUS here is a token (Symbol), not a class —
    // GcpPubSubEventBusAdapter is registered exactly once, above. TRIGGER_BUS resolves to
    // whatever EVENT_BUS resolves to (same singleton), and correctly follows EVENT_BUS overrides
    // in tests too (mirrors PUSHABLE_EVENT_BUS's identical alias in app.module.ts).
    { provide: TRIGGER_BUS, useExisting: EVENT_BUS },
  ],
  exports: [EVENT_BUS, TRIGGER_BUS],
})
export class EventBusModule {}
