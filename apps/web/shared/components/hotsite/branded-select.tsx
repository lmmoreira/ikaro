import * as React from 'react';
import { brandedFieldProps, type BrandedFieldCallerStyle } from './branded-field-style';

export type BrandedSelectProps = Omit<React.ComponentPropsWithoutRef<'select'>, 'style'> & {
  /** Paints the fixed red outline and sets `aria-invalid`. */
  readonly invalid?: boolean;
  /** Only the radius may be overridden (a prefix/input pair joins its corners). */
  readonly style?: BrandedFieldCallerStyle;
};

/**
 * A native select drawn on the tenant's secondary colour: readable text, the derived placeholder
 * tint and a border that reaches 3:1 on any palette. A caller passes `invalid` and layout classes,
 * never a colour. ESLint sends a raw `<select>` in the branded trees here.
 */
export const BrandedSelect = React.forwardRef<HTMLSelectElement, BrandedSelectProps>(
  ({ invalid, className, style, ...props }, ref) => (
    <select ref={ref} {...props} {...brandedFieldProps({ invalid, className, style })} />
  ),
);
BrandedSelect.displayName = 'BrandedSelect';
