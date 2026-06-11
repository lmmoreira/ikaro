import {
  TenantSettings,
  TenantSettingsProps,
} from '../../../contexts/platform/domain/value-objects/tenant-settings.vo';
import { TenantEntity } from '../../../contexts/platform/infrastructure/entities/tenant.entity';

export class TenantEntityBuilder {
  private id = 'tenant-id-1';
  private readonly name = 'BeloAuto';
  private slug = 'beloauto';
  private isActive = true;
  private settings: TenantSettingsProps = TenantSettings.default().toJSON();
  private readonly createdAt = new Date('2026-01-01T00:00:00Z');
  private readonly updatedAt = new Date('2026-01-01T00:00:00Z');

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withSlug(slug: string): this {
    this.slug = slug;
    return this;
  }

  withIsActive(isActive: boolean): this {
    this.isActive = isActive;
    return this;
  }

  withSettings(settings: TenantSettingsProps): this {
    this.settings = settings;
    return this;
  }

  build(): TenantEntity {
    const e = new TenantEntity();
    e.id = this.id;
    e.name = this.name;
    e.slug = this.slug;
    e.settings = this.settings;
    e.isActive = this.isActive;
    e.createdAt = this.createdAt;
    e.updatedAt = this.updatedAt;
    return e;
  }
}
