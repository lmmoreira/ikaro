import { Command } from '../../shared/domain/command';
import { DomainEvent } from '../../shared/domain/domain-event';

// Shared stubs for the outbox specs that each independently hand-rolled the same minimal
// DomainEvent/Command subclass (bad-smell-audit BE-3, TD24-S03) — a single-field payload is
// enough to exercise dedup-key derivation and envelope pass-through; neither class needs any
// real business shape.
export class StubEvent extends DomainEvent<{ value: string }> {
  readonly eventVersion = 1;
  readonly data: { value: string };
  constructor(tenantId: string, correlationId: string, data: { value: string }) {
    super(tenantId, correlationId);
    this.data = data;
  }
}

export class StubCommand extends Command<{ value: string }> {
  readonly eventVersion = 1;
  readonly data: { value: string };
  constructor(tenantId: string, correlationId: string, data: { value: string }, dedupKey: string) {
    super(tenantId, correlationId, dedupKey);
    this.data = data;
  }
}
