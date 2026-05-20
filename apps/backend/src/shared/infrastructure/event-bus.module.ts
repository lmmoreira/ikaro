import { Global, Module } from '@nestjs/common';
import { EVENT_BUS } from '../ports/event-bus.port';
import { GcpPubSubEventBusAdapter } from './gcp-pubsub-event-bus.adapter';

// @Global makes EVENT_BUS injectable in every context module without an explicit import.
// This module is imported once in AppModule. In local dev and integration tests it connects
// to the GCP Pub/Sub emulator via PUBSUB_EMULATOR_HOST; in production it uses real GCP.
@Global()
@Module({
  providers: [{ provide: EVENT_BUS, useClass: GcpPubSubEventBusAdapter }],
  exports: [EVENT_BUS],
})
export class EventBusModule {}
