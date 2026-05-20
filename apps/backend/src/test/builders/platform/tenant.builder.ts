import { Tenant } from '../../../contexts/platform/domain/tenant.aggregate';

const DEFAULT_ADMIN_EMAIL = 'admin@beloauto.com.br';
const DEFAULT_CORRELATION = 'corr-test-builder';

export class TenantBuilder {
  private name = 'BeloAuto';
  private slug = 'beloauto';
  private timezone = 'America/Sao_Paulo';
  private adminEmail = DEFAULT_ADMIN_EMAIL;

  withName(name: string): this {
    this.name = name;
    return this;
  }

  withSlug(slug: string): this {
    this.slug = slug;
    return this;
  }

  withTimezone(timezone: string): this {
    this.timezone = timezone;
    return this;
  }

  withAdminEmail(adminEmail: string): this {
    this.adminEmail = adminEmail;
    return this;
  }

  build(): Tenant {
    const tenant = Tenant.create(
      this.name,
      this.slug,
      this.adminEmail,
      DEFAULT_CORRELATION,
      this.timezone,
    );
    tenant.clearDomainEvents(); // builders don't produce events in tests
    return tenant;
  }
}
