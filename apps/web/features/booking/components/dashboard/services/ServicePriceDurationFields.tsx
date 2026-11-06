'use client';

import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { FIELD_INVALID_CLASS, FieldFeedback } from '@/shared/components/ui/field-feedback';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import type { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { cn } from '@/shared/utils/cn';

interface ServicePriceDurationFieldsProps {
  readonly priceAmount: string;
  readonly durationMinutes: string;
  readonly feedback: Pick<
    ReturnType<typeof useFormFeedback>,
    'fieldProps' | 'fieldErrors' | 'fieldErrorId'
  >;
  /** A legged service's duration is its legs' span, computed by the backend: shown, never edited. */
  readonly durationLocked?: boolean;
  readonly onPriceAmountChange: (value: string) => void;
  readonly onDurationMinutesChange: (value: string) => void;
}

// Extracted from ServiceFormFields (TD37-S5A) — the price and duration inputs are a cohesive
// "grid gap-4" pair with their own error/hint rendering, unrelated to the fields around them.
export function ServicePriceDurationFields({
  priceAmount,
  durationMinutes,
  feedback,
  durationLocked = false,
  onPriceAmountChange,
  onDurationMinutesChange,
}: ServicePriceDurationFieldsProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const { currencySymbol } = useFormatting();
  const { fieldProps, fieldErrors, fieldErrorId } = feedback;
  const priceError = fieldErrors.priceAmount;
  const durationError = fieldErrors.durationMinutes;
  let durationDescribedBy: string | undefined;
  if (durationError) durationDescribedBy = fieldErrorId('durationMinutes');
  else if (durationLocked) durationDescribedBy = 'service-duration-locked-hint';

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <Label htmlFor="service-price">{t('createPriceLabel')}</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500">
            {currencySymbol}
          </span>
          <Input
            id="service-price"
            data-testid="service-price-input"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={priceAmount}
            onChange={(event) => onPriceAmountChange(event.target.value)}
            placeholder={t('createPricePlaceholder')}
            {...fieldProps('priceAmount')}
            aria-describedby={priceError ? fieldErrorId('priceAmount') : 'service-price-warning'}
            className={cn(
              'w-full rounded-md border border-border bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100',
              priceError && FIELD_INVALID_CLASS,
            )}
          />
        </div>
        <FieldFeedback id={fieldErrorId('priceAmount')}>{priceError}</FieldFeedback>
        {!priceError && (
          <p
            id="service-price-warning"
            className="mt-1.5 flex items-center gap-1.5 text-sm text-amber-700"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t('editPriceWarning')}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="service-duration">{t('createDurationLabel')}</Label>
        <div className="relative">
          <Input
            id="service-duration"
            data-testid="service-duration-input"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={durationMinutes}
            readOnly={durationLocked}
            aria-readonly={durationLocked || undefined}
            onChange={(event) => onDurationMinutesChange(event.target.value)}
            placeholder={t('createDurationPlaceholder')}
            {...fieldProps('durationMinutes')}
            aria-describedby={durationDescribedBy}
            className={cn(
              'w-full rounded-md border border-border bg-white py-2.5 pl-3 pr-12 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100',
              durationError && FIELD_INVALID_CLASS,
            )}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">
            min
          </span>
        </div>
        {durationLocked && (
          <p
            id="service-duration-locked-hint"
            data-testid="service-duration-locked-hint"
            className="mt-1.5 text-sm text-gray-500"
          >
            {t('durationLegsLockedHint')}
          </p>
        )}
        <FieldFeedback id={fieldErrorId('durationMinutes')}>{durationError}</FieldFeedback>
      </div>
    </div>
  );
}
