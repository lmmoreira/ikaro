import type React from 'react';
import { brandedSurfaceStyle } from './branded-surface-style';

/**
 * The one look of a public-hotsite input drawn on the tenant's secondary colour (TD51-S05). Text,
 * and the typed value, take `--ba-secondary-text` through the shared surface style. An invalid
 * field drops the border colour so `BRANDED_FIELD_INVALID_CLASS` (branded-field-feedback) paints
 * the error border.
 */
export function brandedFieldStyle({
  invalid = false,
}: { readonly invalid?: boolean } = {}): React.CSSProperties {
  return {
    ...brandedSurfaceStyle,
    ...(invalid ? {} : { borderColor: 'var(--ba-secondary)' }),
  };
}

/**
 * Tailwind class for the input placeholder, which an inline style cannot reach. The token is a
 * softened tint of the readable text colour that still meets AA over the secondary colour.
 */
export const BRANDED_FIELD_PLACEHOLDER_CLASS =
  'placeholder:[color:var(--ba-secondary-placeholder,var(--ba-secondary-text))]';
