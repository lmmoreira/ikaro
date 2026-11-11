import type React from 'react';
import { cn } from '@/shared/utils/cn';
import { BRANDED_FIELD_INVALID_CLASS } from './branded-field-feedback';
import { brandedSurfaceStyle } from './branded-surface-style';

/**
 * The one look of a public-hotsite input drawn on the tenant's secondary colour (TD51-S05). Text,
 * and the typed value, take `--ba-secondary-text` through the shared surface style. An invalid
 * field drops the border colour so `BRANDED_FIELD_INVALID_CLASS` (branded-field-feedback) paints
 * the error border. The valid border is `--ba-field-border`, which `applyBranding()` derives to reach
 * 3:1 against the page and the fill, so the edge never disappears.
 */
export function brandedFieldStyle({
  invalid = false,
}: { readonly invalid?: boolean } = {}): React.CSSProperties {
  return {
    ...brandedSurfaceStyle,
    ...(invalid ? {} : { borderColor: 'var(--ba-field-border)' }),
  };
}

/**
 * Tailwind class for the input placeholder, which an inline style cannot reach. The token is a
 * softened tint of the readable text colour that still meets AA over the secondary colour.
 */
export const BRANDED_FIELD_PLACEHOLDER_CLASS =
  'placeholder:[color:var(--ba-secondary-muted,var(--ba-secondary-text))]';

/** The only inline style a caller may add to a branded control: a pair joins its radii. */
export type BrandedFieldCallerStyle = Pick<React.CSSProperties, 'borderRadius'>;

interface BrandedFieldPropsInput {
  readonly invalid?: boolean;
  readonly className?: string;
  readonly style?: BrandedFieldCallerStyle;
}

/**
 * What every branded control (`BrandedInput`, `BrandedTextarea`, `BrandedSelect`) applies on top of
 * the caller's props: the field look, the placeholder tint, the invalid outline, and `aria-invalid`
 * derived from the same flag so the two cannot disagree.
 */
export function brandedFieldProps({ invalid = false, className, style }: BrandedFieldPropsInput): {
  readonly className: string;
  readonly style: React.CSSProperties;
  readonly 'aria-invalid'?: true;
} {
  return {
    className: cn(
      'border',
      BRANDED_FIELD_PLACEHOLDER_CLASS,
      invalid && BRANDED_FIELD_INVALID_CLASS,
      className,
    ),
    // Only the radius is taken from the caller: the type is structural, so an object that carries
    // other keys (a `borderColor` held in a variable) would otherwise reach the spread.
    style: {
      ...brandedFieldStyle({ invalid }),
      ...(style?.borderRadius === undefined ? {} : { borderRadius: style.borderRadius }),
    },
    ...(invalid ? { 'aria-invalid': true as const } : {}),
  };
}
