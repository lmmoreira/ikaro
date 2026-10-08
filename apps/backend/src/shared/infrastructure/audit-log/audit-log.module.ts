import { Global, Module } from '@nestjs/common';
import { LogDomainEventUseCase } from '../../application/use-cases/log-domain-event.use-case';

// @Global() (M23-S36): every context's `<Context>AuditLogHandler` injects LogDomainEventUseCase,
// matching InboxModule's own @Global() pattern so no context module needs an explicit import.
// @Global() only waives the importing module's `imports:` entry — it never substitutes for
// `exports:` (docs/ANTI_PATTERNS.md), so the use case is listed in both.
@Global()
@Module({
  providers: [LogDomainEventUseCase],
  exports: [LogDomainEventUseCase],
})
export class AuditLogModule {}
