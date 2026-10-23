import { BookingErrorCode } from '@ikaro/types/protocol/errors';
import { BookingDomainError } from './booking-domain-error.base';

export class ServicePublicSlugInvalidError extends BookingDomainError {
  constructor(reason: 'format' | 'length') {
    super(
      reason === 'length'
        ? 'A service public slug must be 3 to 60 characters long'
        : 'A service public slug may only contain lowercase letters, numbers and hyphens, with no leading or trailing hyphen',
      BookingErrorCode.SERVICE_PUBLIC_SLUG_INVALID,
    );
    this.name = 'ServicePublicSlugInvalidError';
  }
}

// Two same-named services published at the same instant can both pick the plain slug; the unique
// index lets one win and this error tells the other to retry (the retry sees the winner and picks
// the id-suffixed slug). Retryable by the client, hence 409.
export class ServicePublicSlugTakenError extends BookingDomainError {
  constructor() {
    super(
      'The generated public slug was taken by another service at the same moment',
      BookingErrorCode.SERVICE_PUBLIC_SLUG_TAKEN,
    );
    this.name = 'ServicePublicSlugTakenError';
  }
}

export type ServicePublicProfileInvalidReason =
  | 'gallery-too-large'
  | 'long-description-too-long'
  | 'inclusions-too-many'
  | 'inclusion-too-long'
  | 'preparation-notes-too-long'
  | 'image-path-invalid'
  | 'image-not-uploaded';

const SERVICE_PUBLIC_PROFILE_INVALID_MESSAGES: Record<ServicePublicProfileInvalidReason, string> = {
  'gallery-too-large': 'The gallery accepts at most 8 images',
  'long-description-too-long': 'The long description accepts at most 4000 characters',
  'inclusions-too-many': 'The inclusions list accepts at most 12 items',
  'inclusion-too-long': 'Each inclusion accepts at most 120 characters',
  'preparation-notes-too-long': 'The preparation notes accept at most 1000 characters',
  'image-path-invalid': 'A service page image path is not a valid storage path',
  'image-not-uploaded': 'A service page image was not uploaded for this tenant',
};

const SERVICE_PUBLIC_PROFILE_INVALID_FIELDS: Record<ServicePublicProfileInvalidReason, string> = {
  'gallery-too-large': 'galleryImageUrls',
  'long-description-too-long': 'longDescription',
  'inclusions-too-many': 'inclusions',
  'inclusion-too-long': 'inclusions',
  'preparation-notes-too-long': 'preparationNotes',
  'image-path-invalid': 'coverImageUrl',
  'image-not-uploaded': 'coverImageUrl',
};

export class ServicePublicProfileInvalidError extends BookingDomainError {
  constructor(reason: ServicePublicProfileInvalidReason) {
    super(
      SERVICE_PUBLIC_PROFILE_INVALID_MESSAGES[reason],
      BookingErrorCode.SERVICE_PUBLIC_PROFILE_INVALID,
      SERVICE_PUBLIC_PROFILE_INVALID_FIELDS[reason],
    );
    this.name = 'ServicePublicProfileInvalidError';
  }
}
