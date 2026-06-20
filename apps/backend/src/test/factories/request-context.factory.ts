import { RequestContext } from '../../shared/request/request-context';
import { TenantSettings } from '../../contexts/platform/domain/value-objects/tenant-settings.vo';
import type { TenantSettingsProps } from '../../contexts/platform/domain/value-objects/tenant-settings.vo';

export class RequestContextBuilder {
  private tenantId = '10000000-0000-4000-8000-000000000001';
  private correlationId = 'corr-test';
  private settings: TenantSettingsProps = TenantSettings.default().toJSON();
  private actorId: string | undefined = undefined;
  private actorType: 'STAFF' | 'CUSTOMER' | undefined = undefined;
  private actorRole: string | undefined = undefined;

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withSettings(settings: TenantSettingsProps): this {
    this.settings = settings;
    return this;
  }

  withActorId(actorId: string): this {
    this.actorId = actorId;
    return this;
  }

  withActorType(actorType: 'STAFF' | 'CUSTOMER'): this {
    this.actorType = actorType;
    return this;
  }

  withActorRole(actorRole: string): this {
    this.actorRole = actorRole;
    return this;
  }

  build(): RequestContext {
    return {
      tenantId: this.tenantId,
      correlationId: this.correlationId,
      settings: this.settings,
      actorId: this.actorId,
      actorType: this.actorType,
      actorRole: this.actorRole,
    };
  }
}
