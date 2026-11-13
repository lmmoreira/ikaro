export const TENANT_DIRECTORY_PORT = Symbol('ITenantDirectoryPort');

export interface ActiveTenant {
  id: string;
  timezone: string;
}

// The tenants a cross-tenant cron iterates. Platform owns the tenants, so Platform implements this;
// every context injects the token without importing Platform's internals. Ids and timezone only,
// and never cached: a cron must see the tenants as they are now.
export interface ITenantDirectoryPort {
  listActiveTenants(): Promise<ActiveTenant[]>;
}
