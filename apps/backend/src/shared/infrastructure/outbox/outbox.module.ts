import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventBusModule } from '../event-bus.module';
import { OutboxEventEntity } from './outbox-event.entity';
import { OutboxRelayController } from './outbox-relay.controller';
import { OutboxRelayTriggerHandler } from './outbox-relay-trigger.handler';
import { OutboxRelayService } from './outbox-relay.service';

// Not @Global() — TD24-S01 ships dark, nothing outside this module needs outbox internals yet.
// EventBusModule is imported explicitly for clarity even though it's already @Global() (matches
// the convention other context modules follow — see docs/AGENT_PATTERNS.md's module skeleton).
@Module({
  imports: [TypeOrmModule.forFeature([OutboxEventEntity]), EventBusModule],
  controllers: [OutboxRelayController],
  providers: [OutboxRelayService, OutboxRelayTriggerHandler],
})
export class OutboxModule {}
