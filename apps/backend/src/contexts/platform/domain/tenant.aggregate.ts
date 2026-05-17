import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { PlatformDomainError, TenantInactiveError } from './errors/platform-domain.error';
import { TenantSettings } from './value-objects/tenant-settings.vo';

const SLUG_PATTERN = /^[a-z0-9-]+$/;

export interface TenantProps {
  id: string;
  name: string;
  slug: string;
  settings: TenantSettings;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class Tenant extends AggregateRoot {
  private readonly props: TenantProps;

  private constructor(props: TenantProps) {
    super();
    this.props = props;
  }

  get id(): string {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get slug(): string {
    return this.props.slug;
  }

  get settings(): TenantSettings {
    return this.props.settings;
  }

  get isActive(): boolean {
    return this.props.isActive;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static create(name: string, slug: string, timezone = 'America/Sao_Paulo'): Tenant {
    if (!name || name.trim().length === 0) {
      throw new PlatformDomainError('Tenant name must not be empty');
    }
    if (!SLUG_PATTERN.test(slug)) {
      throw new PlatformDomainError(
        'Tenant slug must only contain lowercase letters, numbers, and hyphens',
      );
    }
    const now = new Date();
    return new Tenant({
      id: uuidv7(),
      name: name.trim(),
      slug,
      settings: TenantSettings.default(timezone),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: TenantProps): Tenant {
    return new Tenant(props);
  }

  updateSettings(settings: TenantSettings): void {
    if (!this.props.isActive) throw new TenantInactiveError(this.props.id);
    this.props.settings = settings;
    this.props.updatedAt = new Date();
  }

  updateName(name: string): void {
    if (!this.props.isActive) throw new TenantInactiveError(this.props.id);
    if (!name || name.trim().length === 0) {
      throw new PlatformDomainError('Tenant name must not be empty');
    }
    this.props.name = name.trim();
    this.props.updatedAt = new Date();
  }

  deactivate(): void {
    this.props.isActive = false;
    this.props.updatedAt = new Date();
  }
}
