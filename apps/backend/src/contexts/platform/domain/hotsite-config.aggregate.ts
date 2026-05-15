import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { PlatformDomainError } from './errors/platform-domain.error';

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export type LayoutModuleType =
  | 'HERO'
  | 'SERVICE_LIST'
  | 'GALLERY'
  | 'TESTIMONIALS'
  | 'BOOKING_CTA'
  | 'ABOUT'
  | 'CONTACT';

export interface LayoutModule {
  type: LayoutModuleType;
  order: number;
}

export interface HotsiteBranding {
  primaryColor?: string;
  logoUrl?: string;
  bannerImageUrl?: string;
}

export interface HotsiteConfigProps {
  id: string;
  tenantId: string;
  branding: HotsiteBranding;
  layout: LayoutModule[];
  isPublished: boolean;
  updatedAt: Date;
}

export class HotsiteConfig extends AggregateRoot {
  private readonly props: HotsiteConfigProps;

  private constructor(props: HotsiteConfigProps) {
    super();
    this.props = props;
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get branding(): HotsiteBranding {
    return this.props.branding;
  }

  get layout(): LayoutModule[] {
    return [...this.props.layout];
  }

  get isPublished(): boolean {
    return this.props.isPublished;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static create(tenantId: string): HotsiteConfig {
    return new HotsiteConfig({
      id: uuidv7(),
      tenantId,
      branding: {},
      layout: [],
      isPublished: false,
      updatedAt: new Date(),
    });
  }

  static reconstitute(props: HotsiteConfigProps): HotsiteConfig {
    return new HotsiteConfig(props);
  }

  updateContent(branding: HotsiteBranding, layout: LayoutModule[]): void {
    if (branding.primaryColor !== undefined && !HEX_COLOR_PATTERN.test(branding.primaryColor)) {
      throw new PlatformDomainError('primaryColor must be a valid hex color (e.g. #FF5733)');
    }
    this.props.branding = branding;
    this.props.layout = layout;
    this.props.updatedAt = new Date();
  }

  publish(): void {
    if (this.props.layout.length === 0) {
      throw new PlatformDomainError('Cannot publish hotsite with empty layout');
    }
    this.props.isPublished = true;
    this.props.updatedAt = new Date();
  }

  unpublish(): void {
    this.props.isPublished = false;
    this.props.updatedAt = new Date();
  }
}
