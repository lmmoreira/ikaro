import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventBusModule } from '../event-bus/event-bus.module';
import { OUTBOX_PUBLISHER } from '../../ports/outbox-publisher.port';
import { OUTBOX_REPOSITORY } from '../../ports/outbox-repository.port';
import { OutboxEventEntity } from './outbox-event.entity';
import { OutboxPublisher } from './outbox-publisher';
import { OutboxRelayController } from './outbox-relay.controller';
import { OutboxRelayTriggerHandler } from './outbox-relay-trigger.handler';
import { OutboxRelayService } from './outbox-relay.service';
import { TypeOrmOutboxRepository } from './typeorm-outbox.repository';

// @Global() (TD24-S02): OUTBOX_PUBLISHER now has real consumers — the 3 event-emitting aggregates'
// repositories (booking, tenant, staff) — matching EventBusModule's own @Global() pattern so
// context modules don't each need an explicit OutboxModule import.
// EventBusModule is imported explicitly for clarity even though it's already @Global() (matches
// the convention other context modules follow — see docs/AGENT_PATTERNS.md's module skeleton).
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([OutboxEventEntity]), EventBusModule],
  controllers: [OutboxRelayController],
  providers: [
    { provide: OUTBOX_REPOSITORY, useClass: TypeOrmOutboxRepository },
    { provide: OUTBOX_PUBLISHER, useClass: OutboxPublisher },
    OutboxRelayService,
    OutboxRelayTriggerHandler,
  ],
  // @Global() alone does not make a provider injectable elsewhere — it still must be exported.
  // OUTBOX_PUBLISHER is the one token the 3 aggregate repositories (TD24-S02) inject from outside
  // this module; nothing outside needs OUTBOX_REPOSITORY directly.
  exports: [OUTBOX_PUBLISHER],
})
export class OutboxModule {}
