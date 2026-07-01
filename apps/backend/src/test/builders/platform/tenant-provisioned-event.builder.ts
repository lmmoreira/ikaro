import { TenantProvisioned } from '../../../contexts/platform/domain/events/tenant-provisioned.event';

export class TenantProvisionedEventBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
  private correlationId = 'corr-tenant-provisioned-1';
  private name = 'Lava Car';
  private slug = 'lavacar';
  private adminEmail = 'admin@lavacar.com.br';
  private timezone = 'America/Sao_Paulo';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withName(name: string): this {
    this.name = name;
    return this;
  }

  withSlug(slug: string): this {
    this.slug = slug;
    return this;
  }

  withAdminEmail(adminEmail: string): this {
    this.adminEmail = adminEmail;
    return this;
  }

  withTimezone(timezone: string): this {
    this.timezone = timezone;
    return this;
  }

  build(): TenantProvisioned {
    return new TenantProvisioned(this.tenantId, this.correlationId, {
      name: this.name,
      slug: this.slug,
      adminEmail: this.adminEmail,
      timezone: this.timezone,
    });
  }
}
