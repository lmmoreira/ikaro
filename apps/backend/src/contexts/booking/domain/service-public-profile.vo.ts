import { SERVICE_PUBLIC_PROFILE_LIMITS } from '@ikaro/types';
import { ServicePublicProfileInvalidError } from './errors/booking-domain.error';

export interface ServicePublicProfileProps {
  coverImageUrl: string | null;
  galleryImageUrls: string[];
  longDescription: string | null;
  inclusions: string[];
  preparationNotes: string | null;
}

export type ServicePublicProfileInput = {
  coverImageUrl?: string | null;
  galleryImageUrls?: string[];
  longDescription?: string | null;
  inclusions?: string[];
  preparationNotes?: string | null;
};

// A path inside the tenant's storage — never a URL, never a traversal. Whether it belongs to this
// tenant and was really uploaded is checked by ServiceImagePromotionService (it knows the tenant
// and the bucket); this only rejects what can never be a storage path.
function assertImagePath(path: string): string {
  const trimmed = path.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > SERVICE_PUBLIC_PROFILE_LIMITS.imagePath ||
    trimmed.includes('..') ||
    trimmed.startsWith('/') ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  ) {
    throw new ServicePublicProfileInvalidError('image-path-invalid');
  }
  return trimmed;
}

function optionalText(
  value: string | null | undefined,
  max: number,
  tooLong: 'long-description-too-long' | 'preparation-notes-too-long',
): string | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) throw new ServicePublicProfileInvalidError(tooLong);
  return trimmed;
}

// The rich copy and media of a service's public page. It is always read and written as one object
// (stored as one JSONB column), so it is one value object rather than five fields on the 400-line
// Service aggregate. Markdown is stored as written, never as HTML; the web renders it through the
// restricted renderer.
export class ServicePublicProfile {
  private constructor(private readonly props: ServicePublicProfileProps) {}

  static create(input: ServicePublicProfileInput): ServicePublicProfile {
    const limits = SERVICE_PUBLIC_PROFILE_LIMITS;
    const gallery = (input.galleryImageUrls ?? []).map(assertImagePath);
    if (gallery.length > limits.galleryImages) {
      throw new ServicePublicProfileInvalidError('gallery-too-large');
    }
    const inclusions = (input.inclusions ?? [])
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (inclusions.length > limits.inclusions) {
      throw new ServicePublicProfileInvalidError('inclusions-too-many');
    }
    if (inclusions.some((item) => item.length > limits.inclusionLength)) {
      throw new ServicePublicProfileInvalidError('inclusion-too-long');
    }
    return new ServicePublicProfile({
      coverImageUrl: input.coverImageUrl ? assertImagePath(input.coverImageUrl) : null,
      galleryImageUrls: gallery,
      longDescription: optionalText(
        input.longDescription,
        limits.longDescription,
        'long-description-too-long',
      ),
      inclusions,
      preparationNotes: optionalText(
        input.preparationNotes,
        limits.preparationNotes,
        'preparation-notes-too-long',
      ),
    });
  }

  static reconstitute(props: ServicePublicProfileProps): ServicePublicProfile {
    return new ServicePublicProfile({
      ...props,
      galleryImageUrls: [...props.galleryImageUrls],
      inclusions: [...props.inclusions],
    });
  }

  get coverImageUrl(): string | null {
    return this.props.coverImageUrl;
  }
  get galleryImageUrls(): string[] {
    return [...this.props.galleryImageUrls];
  }
  get longDescription(): string | null {
    return this.props.longDescription;
  }
  get inclusions(): string[] {
    return [...this.props.inclusions];
  }
  get preparationNotes(): string | null {
    return this.props.preparationNotes;
  }

  // Every image path the profile references, cover first — what the promotion step checks and
  // what the superseded-object cleanup diffs.
  imagePaths(): string[] {
    const { coverImageUrl, galleryImageUrls } = this.props;
    return coverImageUrl ? [coverImageUrl, ...galleryImageUrls] : [...galleryImageUrls];
  }

  // The same profile with every image path passed through `rewrite` (tmp → permanent).
  mapImagePaths(rewrite: (path: string) => string): ServicePublicProfile {
    return new ServicePublicProfile({
      ...this.props,
      coverImageUrl: this.props.coverImageUrl ? rewrite(this.props.coverImageUrl) : null,
      galleryImageUrls: this.props.galleryImageUrls.map(rewrite),
      inclusions: [...this.props.inclusions],
    });
  }

  toJSON(): ServicePublicProfileProps {
    return {
      coverImageUrl: this.props.coverImageUrl,
      galleryImageUrls: [...this.props.galleryImageUrls],
      longDescription: this.props.longDescription,
      inclusions: [...this.props.inclusions],
      preparationNotes: this.props.preparationNotes,
    };
  }
}
