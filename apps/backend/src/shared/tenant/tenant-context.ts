export class TenantContext {
  private _tenantId: string | null = null;
  private _tenantSlug: string | null = null;

  get tenantId(): string {
    if (!this._tenantId) throw new Error('TenantContext not initialised');
    return this._tenantId;
  }

  get tenantSlug(): string {
    if (!this._tenantSlug) throw new Error('TenantContext not initialised');
    return this._tenantSlug;
  }

  set(tenantId: string, tenantSlug: string): void {
    this._tenantId = tenantId;
    this._tenantSlug = tenantSlug;
  }

  isInitialised(): boolean {
    return this._tenantId !== null;
  }
}
