'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import type { ServiceFormErrors } from '@/features/booking/services/service-form';

interface ServiceFormFieldsProps {
  readonly name: string;
  readonly description: string;
  readonly priceAmount: string;
  readonly durationMinutes: string;
  readonly loyaltyPointsValue: string;
  readonly requiresPickupAddress: boolean;
  readonly fieldErrors: ServiceFormErrors;
  readonly onNameChange: (value: string) => void;
  readonly onDescriptionChange: (value: string) => void;
  readonly onPriceAmountChange: (value: string) => void;
  readonly onDurationMinutesChange: (value: string) => void;
  readonly onLoyaltyPointsValueChange: (value: string) => void;
  readonly onToggleRequiresPickupAddress: () => void;
  readonly children?: ReactNode;
}

export function ServiceFormFields({
  name,
  description,
  priceAmount,
  durationMinutes,
  loyaltyPointsValue,
  requiresPickupAddress,
  fieldErrors,
  onNameChange,
  onDescriptionChange,
  onPriceAmountChange,
  onDurationMinutesChange,
  onLoyaltyPointsValueChange,
  onToggleRequiresPickupAddress,
  children,
}: ServiceFormFieldsProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <>
      <section className="space-y-4">
        <div>
          <label
            htmlFor="service-name"
            className="mb-1.5 block text-sm font-semibold text-gray-900"
          >
            {t('createNameLabel')}
          </label>
          <input
            id="service-name"
            data-testid="service-name-input"
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            maxLength={100}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'service-name-error' : undefined}
            placeholder={t('createNamePlaceholder')}
            className="w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50"
          />
          {fieldErrors.name && (
            <p
              id="service-name-error"
              data-testid="service-name-error"
              className="mt-1.5 text-sm text-red-600"
            >
              {fieldErrors.name}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="service-description"
            className="mb-1.5 block text-sm font-semibold text-gray-900"
          >
            {t('createDescriptionLabel')}
          </label>
          <textarea
            id="service-description"
            data-testid="service-description-input"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            maxLength={500}
            placeholder={t('createDescriptionPlaceholder')}
            className="min-h-24 w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          {fieldErrors.description && (
            <p data-testid="service-description-error" className="mt-1.5 text-sm text-red-600">
              {fieldErrors.description}
            </p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="service-price"
              className="mb-1.5 block text-sm font-semibold text-gray-900"
            >
              {t('createPriceLabel')}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500">
                R$
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
                aria-invalid={Boolean(fieldErrors.priceAmount)}
                aria-describedby={
                  fieldErrors.priceAmount ? 'service-price-error' : 'service-price-warning'
                }
                placeholder={t('createPricePlaceholder')}
                className="w-full rounded-md border border-border bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50"
              />
            </div>
            {fieldErrors.priceAmount ? (
              <p
                id="service-price-error"
                data-testid="service-price-error"
                className="mt-1.5 text-sm text-red-600"
              >
                {fieldErrors.priceAmount}
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
                aria-invalid={Boolean(fieldErrors.durationMinutes)}
                aria-describedby={
                  fieldErrors.durationMinutes ? 'service-duration-error' : undefined
                }
                placeholder={t('createDurationPlaceholder')}
                className="w-full rounded-md border border-border bg-white py-2.5 pl-3 pr-12 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">
                min
              </span>
            </div>
            {fieldErrors.durationMinutes && (
              <p
                id="service-duration-error"
                data-testid="service-duration-error"
                className="mt-1.5 text-sm text-red-600"
              >
                {fieldErrors.durationMinutes}
              </p>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="service-points"
            className="mb-1.5 block text-sm font-semibold text-gray-900"
          >
            {t('createPointsLabel')}
          </label>
          <input
            id="service-points"
            data-testid="service-points-input"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={loyaltyPointsValue}
            onChange={(event) => onLoyaltyPointsValueChange(event.target.value)}
            aria-invalid={Boolean(fieldErrors.loyaltyPointsValue)}
            aria-describedby={
              fieldErrors.loyaltyPointsValue ? 'service-points-error' : 'service-points-hint'
            }
            placeholder={t('createPointsPlaceholder')}
            className="w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50"
          />
          {fieldErrors.loyaltyPointsValue ? (
            <p
              id="service-points-error"
              data-testid="service-points-error"
              className="mt-1.5 text-sm text-red-600"
            >
              {fieldErrors.loyaltyPointsValue}
            </p>
          ) : (
            <p id="service-points-hint" className="mt-1.5 text-sm text-gray-500">
              {t('createPointsHint')}
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
          {t('servicesOptionsTitle')}
        </p>
        <button
          type="button"
          role="switch"
          data-testid="service-pickup-switch"
          aria-checked={requiresPickupAddress}
          onClick={onToggleRequiresPickupAddress}
          className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100"
        >
          <span className="pr-4">
            <span className="block text-sm font-semibold text-gray-900">
              {t('createPickupLabel')}
            </span>
            <span className="mt-0.5 block text-sm text-gray-500">{t('createPickupHint')}</span>
          </span>
          <span
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
              requiresPickupAddress ? 'bg-blue-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                requiresPickupAddress ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      </section>

      {children}

      {fieldErrors.submit && (
        <div
          data-testid="service-submit-error"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {fieldErrors.submit}
        </div>
      )}
    </>
  );
}
