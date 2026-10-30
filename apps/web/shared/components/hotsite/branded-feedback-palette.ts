/**
 * Fixed semantic colours of the public-hotsite feedback box. They never derive from the tenant's
 * `--ba-*` colour tokens: a tenant colour equal to the message colour would make the box vanish,
 * and `--ba-text` is calibrated against the tenant's own background, not this white surface.
 * `branded-feedback-contrast.spec.ts` pins the ratios.
 */
export const BRANDED_FEEDBACK_SURFACE = '#ffffff';

export const BRANDED_FEEDBACK_PALETTE = {
  error: { border: '#dc2626', text: '#991b1b' },
  success: { border: '#16a34a', text: '#166534' },
} as const;

/**
 * Fixed dark outer ring. Against any tenant background either the white surface or this ring
 * stands out by at least 3:1 (white wins on dark pages, the ring on mid-tone and light ones),
 * so the box edge never depends on a tenant colour.
 */
export const BRANDED_FEEDBACK_EDGE = '#1f2937';

export const BRANDED_FEEDBACK_SHADOW = `0 0 0 1px ${BRANDED_FEEDBACK_EDGE}, 0 1px 3px rgba(0, 0, 0, 0.25)`;

/** Field message text; painted on its own white chip, so it reads on any tenant background. */
export const BRANDED_FIELD_MESSAGE_COLOR = '#b91c1c';
