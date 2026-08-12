export const ALLOWED_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type ImageContentType = (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number];
