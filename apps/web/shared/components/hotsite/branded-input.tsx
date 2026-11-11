import * as React from 'react';
import { brandedFieldProps, type BrandedFieldCallerStyle } from './branded-field-style';

export type BrandedInputProps = Omit<React.ComponentPropsWithoutRef<'input'>, 'style'> & {
  /** Paints the fixed red outline and sets `aria-invalid`. */
  readonly invalid?: boolean;
  /** Only the radius may be overridden (a prefix/input pair joins its corners). */
  readonly style?: BrandedFieldCallerStyle;
};

/**
 * A text input drawn on the tenant's secondary colour (TD51-S06): readable text, the derived placeholder
 * tint and a border that reaches 3:1 on any palette. A caller passes `invalid` and layout classes,
 * never a colour. ESLint sends a raw `<input>` in the branded trees here.
 */
export const BrandedInput = React.forwardRef<HTMLInputElement, BrandedInputProps>(
  ({ invalid, className, style, ...props }, ref) => (
    <input ref={ref} {...props} {...brandedFieldProps({ invalid, className, style })} />
  ),
);
BrandedInput.displayName = 'BrandedInput';
