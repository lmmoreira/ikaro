'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { ServiceFormErrors } from '@/features/booking/services/service-form';
import { ServicePickupSwitch } from './ServicePickupSwitch';
import { ServicePriceDurationFields } from './ServicePriceDurationFields';

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

        <ServicePriceDurationFields
          priceAmount={priceAmount}
          durationMinutes={durationMinutes}
          priceError={fieldErrors.priceAmount}
          durationError={fieldErrors.durationMinutes}
          onPriceAmountChange={onPriceAmountChange}
          onDurationMinutesChange={onDurationMinutesChange}
        />

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

      <ServicePickupSwitch
        checked={requiresPickupAddress}
        onToggle={onToggleRequiresPickupAddress}
      />

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
