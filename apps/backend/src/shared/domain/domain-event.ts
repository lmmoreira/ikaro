import { Envelope } from './envelope';

// A fact that already happened to an aggregate — emitted at most once per business action
// (booking approved, staff invited, ...). No dedup concept: the action itself can only happen
// once, so eventId already identifies the fact uniquely. Contrast with Command (command.ts),
// which a scheduled job may legitimately construct more than once for the same underlying fact.
export abstract class DomainEvent<
  TData extends Record<string, unknown> = Record<string, unknown>,
> extends Envelope<TData> {}
