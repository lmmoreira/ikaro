import {
  DEFAULT_HOTSITE_BRANDING,
  HotsiteBranding,
  HotsiteModule,
} from '../../../contexts/platform/domain/hotsite-config.aggregate';
import { HotsiteConfigEntity } from '../../../contexts/platform/infrastructure/entities/hotsite-config.entity';

const DEFAULT_LAYOUT: HotsiteModule[] = [
  {
    type: 'HERO',
    enabled: true,
    data: {
      variant: 'centered',
      title: 'Cuidado completo para o seu carro',
      ctaLabel: 'Agendar agora',
      ctaTarget: 'booking',
    },
  },
];

export class HotsiteConfigEntityBuilder {
  private id = 'config-id-1';
  private tenantId = 'tenant-id-1';
  private isPublished = false;
  private branding: HotsiteBranding = { ...DEFAULT_HOTSITE_BRANDING };
  private readonly updatedAt = new Date('2026-01-01T00:00:00Z');

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withIsPublished(isPublished: boolean): this {
    this.isPublished = isPublished;
    return this;
  }

  withBranding(branding: Partial<HotsiteBranding>): this {
    this.branding = { ...this.branding, ...branding };
    return this;
  }

  build(): HotsiteConfigEntity {
    const e = new HotsiteConfigEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.branding = this.branding;
    e.layout = DEFAULT_LAYOUT;
    e.isPublished = this.isPublished;
    e.updatedAt = this.updatedAt;
    return e;
  }
}
