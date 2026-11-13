import type { ActiveTenant, ITenantDirectoryPort } from '../../shared/ports/tenant-directory.port';

export class InMemoryTenantDirectoryPort implements ITenantDirectoryPort {
  private readonly tenants: ActiveTenant[] = [];
  // State-based replacement for a jest.fn() call-count assertion.
  listCalls = 0;

  seed(tenants: ActiveTenant[]): void {
    this.tenants.push(...tenants);
  }

  clear(): void {
    this.tenants.length = 0;
    this.listCalls = 0;
  }

  async listActiveTenants(): Promise<ActiveTenant[]> {
    this.listCalls += 1;
    return [...this.tenants];
  }
}
