import { ILeadFormConfigRepository } from '../../../contexts/platform/application/ports/lead-form-config-repository.port';
import { LeadFormConfig } from '../../../contexts/platform/domain/lead-form-config.aggregate';

export class InMemoryLeadFormConfigRepository implements ILeadFormConfigRepository {
  private readonly store = new Map<string, LeadFormConfig>();

  async findByTenantId(tenantId: string): Promise<LeadFormConfig | null> {
    return this.store.get(tenantId) ?? null;
  }

  async save(config: LeadFormConfig): Promise<void> {
    this.store.set(config.tenantId, config);
  }
}
