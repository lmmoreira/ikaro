import { IProviderEventRepository } from '../../../contexts/billing/application/ports/provider-event-repository.port';
import type { BillingProvider } from '../../../contexts/billing/domain/billing-account.aggregate';
import type { ProviderEvent } from '../../../contexts/billing/domain/provider-event';

export class InMemoryProviderEventRepository implements IProviderEventRepository {
  readonly saved: ProviderEvent[] = [];

  async exists(provider: BillingProvider, eventId: string): Promise<boolean> {
    return this.saved.some((row) => row.provider === provider && row.eventId === eventId);
  }

  async existsProcessedAfter(provider: BillingProvider, since: Date): Promise<boolean> {
    return this.saved.some(
      (row) => row.provider === provider && row.receivedAt.getTime() > since.getTime(),
    );
  }

  async insertIfAbsent(event: ProviderEvent): Promise<boolean> {
    const exists = this.saved.some(
      (row) => row.provider === event.provider && row.eventId === event.eventId,
    );
    if (exists) return false;
    this.saved.push(event);
    return true;
  }
}
