import * as React from 'react';
import { Input, type InputProps } from '@/shared/components/ui/input';
import { cn } from '@/shared/utils/cn';

export interface NumberInputProps extends Omit<InputProps, 'type'> {
  // The unit the number is measured in, already translated ("min", "dias", "pts", a currency
  // symbol). Required so a numeric field cannot be drawn without one.
  readonly unit: string;
  // 'suffix' (default) sits after the number; 'prefix' before it, for a currency symbol.
  readonly unitPosition?: 'prefix' | 'suffix';
  // Width and placement of the field as a whole (the unit follows the input's edge); `className`
  // styles the `<input>` itself.
  readonly wrapperClassName?: string;
}

// A number input that shows its unit inside the field, so the user never has to guess whether a
// value is minutes, hours or days (TD51-S3). The unit is overlaid on the input's edge and the
// input's padding grows with it, so the digits never run under the unit. Same look the settings
// page used before it moved here. A primitive imports no i18n: the caller passes the translated
// unit. Browser spin buttons are hidden because they would sit under the unit.
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      unit,
      unitPosition = 'suffix',
      wrapperClassName,
      className,
      style,
      'aria-describedby': describedBy,
      ...props
    },
    ref,
  ) => {
    const unitId = React.useId();
    const isPrefix = unitPosition === 'prefix';
    const hasUnit = unit !== '';
    const padding = hasUnit ? `calc(${unit.length}ch + 1.75rem)` : undefined;

    return (
      <div className={cn('relative w-full', wrapperClassName)}>
        <Input
          ref={ref}
          type="number"
          aria-describedby={
            [describedBy, hasUnit ? unitId : undefined].filter(Boolean).join(' ') || undefined
          }
          style={
            padding ? { ...style, [isPrefix ? 'paddingLeft' : 'paddingRight']: padding } : style
          }
          className={cn(
            '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
            className,
          )}
          {...props}
        />
        {hasUnit && (
          <span
            id={unitId}
            className={cn(
              'pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-muted-foreground',
              isPrefix ? 'left-3' : 'right-3',
            )}
          >
            {unit}
          </span>
        )}
      </div>
    );
  },
);
NumberInput.displayName = 'NumberInput';
