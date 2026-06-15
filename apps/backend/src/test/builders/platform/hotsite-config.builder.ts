import {
  DEFAULT_HOTSITE_BRANDING,
  DEFAULT_HOTSITE_SEO,
  HotsiteBranding,
  HotsiteConfig,
  HotsiteModule,
  HotsiteSeo,
} from '../../../contexts/platform/domain/hotsite-config.aggregate';

const DEFAULT_TENANT_ID = '01234567-0000-7000-8000-000000000001';

const DEFAULT_LAYOUT: HotsiteModule[] = [
  {
    type: 'HERO',
    enabled: true,
    data: {
      variant: 'centered',
      title: 'Cuidado completo para o seu carro',
      ctaLabel: 'Agendar agora',
      ctaTarget: 'booking-form',
    },
  },
];

export class HotsiteConfigBuilder {
  private tenantId = DEFAULT_TENANT_ID;
  private seo: HotsiteSeo = DEFAULT_HOTSITE_SEO;

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withSeo(seo: HotsiteSeo): this {
    this.seo = seo;
    return this;
  }

  build(): HotsiteConfig {
    return HotsiteConfig.create(this.tenantId);
  }

  buildWithContent(
    branding: HotsiteBranding = DEFAULT_HOTSITE_BRANDING,
    layout: HotsiteModule[] = DEFAULT_LAYOUT,
  ): HotsiteConfig {
    const config = HotsiteConfig.create(this.tenantId);
    config.updateContent(branding, layout, this.seo);
    return config;
  }

  buildPublished(
    branding: HotsiteBranding = DEFAULT_HOTSITE_BRANDING,
    layout: HotsiteModule[] = DEFAULT_LAYOUT,
  ): HotsiteConfig {
    const config = this.buildWithContent(branding, layout);
    config.publish();
    return config;
  }
}
