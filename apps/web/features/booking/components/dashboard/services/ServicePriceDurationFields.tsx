'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

interface ServicePriceDurationFieldsProps {
  readonly priceAmount: string;
  readonly durationMinutes: string;
  readonly priceError: string | undefined;
  readonly durationError: string | undefined;
  readonly onPriceAmountChange: (value: string) => void;
  readonly onDurationMinutesChange: (value: string) => void;
}

// Extracted from ServiceFormFields (TD37-S5A) — the price and duration inputs are a cohesive
// "grid gap-4" pair with their own error/hint rendering, unrelated to the fields around them.
export function ServicePriceDurationFields({
  priceAmount,
  durationMinutes,
  priceError,
  durationError,
  onPriceAmountChange,
  onDurationMinutesChange,
}: ServicePriceDurationFieldsProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const { currencySymbol } = useFormatting();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <label htmlFor="service-price" className="mb-1.5 block text-sm font-semibold text-gray-900">
          {t('createPriceLabel')}
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500">
            {currencySymbol}
          </span>
          <input
            id="service-price"
            data-testid="service-price-input"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={priceAmount}
            onChange={(event) => onPriceAmountChange(event.target.value)}
            aria-invalid={Boolean(priceError)}
            aria-describedby={priceError ? 'service-price-error' : 'service-price-warning'}
            placeholder={t('createPricePlaceholder')}
            className="w-full rounded-md border border-border bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50"
          />
        </div>
        {priceError ? (
          <p
            id="service-price-error"
            data-testid="service-price-error"
            className="mt-1.5 text-sm text-red-600"
          >
            {priceError}
          </p>
        ) : (
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
        <label
          htmlFor="service-duration"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('createDurationLabel')}
        </label>
        <div className="relative">
          <input
            id="service-duration"
            data-testid="service-duration-input"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={durationMinutes}
            onChange={(event) => onDurationMinutesChange(event.target.value)}
            aria-invalid={Boolean(durationError)}
            aria-describedby={durationError ? 'service-duration-error' : undefined}
            placeholder={t('createDurationPlaceholder')}
            className="w-full rounded-md border border-border bg-white py-2.5 pl-3 pr-12 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">
            min
          </span>
        </div>
        {durationError && (
          <p
            id="service-duration-error"
            data-testid="service-duration-error"
            className="mt-1.5 text-sm text-red-600"
          >
            {durationError}
          </p>
        )}
      </div>
    </div>
  );
}
