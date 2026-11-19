import { IProviderEventRepository } from '../../../contexts/billing/application/ports/provider-event-repository.port';
import type { ProviderEvent } from '../../../contexts/billing/domain/provider-event';

export class InMemoryProviderEventRepository implements IProviderEventRepository {
  readonly saved: ProviderEvent[] = [];

  async insertIfAbsent(event: ProviderEvent): Promise<boolean> {
    const exists = this.saved.some(
      (row) => row.provider === event.provider && row.eventId === event.eventId,
    );
    if (exists) return false;
    this.saved.push(event);
    return true;
  }
}
