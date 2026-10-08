import { Module } from '@nestjs/common';
import { LogDomainEventUseCase } from '../../application/use-cases/log-domain-event.use-case';

// Deliberately NOT @Global() (M23-S36): each context module that owns a `<Context>AuditLogHandler`
// imports this module itself. A global registered only in AppModule is invisible to the many
// integration/component harnesses that compose a context module without AppModule, and every one
// of them would fail to resolve LogDomainEventUseCase. INBOX_REPOSITORY, which the use case needs,
// is already provided by the global InboxModule every such harness imports.
@Module({
  providers: [LogDomainEventUseCase],
  exports: [LogDomainEventUseCase],
})
export class AuditLogModule {}
