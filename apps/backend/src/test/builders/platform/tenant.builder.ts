import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { Slug } from '../../../shared/value-objects/slug.vo';
import { Tenant } from '../../../contexts/platform/domain/tenant.aggregate';
import { TenantSettings } from '../../../contexts/platform/domain/value-objects/tenant-settings.vo';

const DEFAULT_ADMIN_EMAIL = 'admin@beloauto.com.br';
const DEFAULT_CORRELATION = 'corr-test-builder';

export class TenantBuilder {
  private name = 'BeloAuto';
  private slug = 'beloauto';
  private timezone = 'America/Sao_Paulo';
  private adminEmail = DEFAULT_ADMIN_EMAIL;
  private id: string | undefined;
  private settings: TenantSettings | undefined;

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

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withSettings(settings: TenantSettings): this {
    this.settings = settings;
    return this;
  }

  build(): Tenant {
    if (this.id === undefined && this.settings === undefined) {
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

    const now = new Date();
    return Tenant.reconstitute({
      id: this.id ?? uuidv7(),
      name: this.name.trim(),
      slug: Slug.create(this.slug),
      settings: this.settings ?? TenantSettings.default(this.timezone),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }
}
