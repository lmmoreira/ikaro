import { LeadFormConfig } from '../../domain/lead-form-config.aggregate';

export const LEAD_FORM_CONFIG_REPOSITORY = Symbol('ILeadFormConfigRepository');

export interface ILeadFormConfigRepository {
  findByTenantId(tenantId: string): Promise<LeadFormConfig | null>;
  /** Upsert semantics — one row per tenant, keyed by tenantId. */
  save(config: LeadFormConfig): Promise<void>;
}
