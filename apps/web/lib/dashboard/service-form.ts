export type ServiceFormTranslator = (key: string) => string;

export interface ServiceFormValues {
  readonly name: string;
  readonly description: string;
  readonly priceAmount: string;
  readonly durationMinutes: string;
  readonly loyaltyPointsValue: string;
}

export interface NormalizedServiceFormValues {
  readonly name: string;
  readonly description: string | null;
  readonly priceAmount: number;
  readonly durationMinutes: number;
  readonly loyaltyPointsValue: number;
}

export interface ServiceFormErrors {
  name?: string;
  description?: string;
  priceAmount?: string;
  durationMinutes?: string;
  loyaltyPointsValue?: string;
  submit?: string;
}

function parseNonNegativeInteger(value: string): number | null {
  if (value.trim() === '') return 0;
  if (!/^\d+$/.test(value)) return null;
  return Number(value);
}

export function validateServiceForm(
  values: ServiceFormValues,
  t: ServiceFormTranslator,
): {
  readonly errors: ServiceFormErrors;
  readonly normalized: NormalizedServiceFormValues | null;
} {
  const trimmedName = values.name.trim();
  const trimmedDescription = values.description.trim();
  const price = Number(values.priceAmount);
  const duration = Number(values.durationMinutes);
  const points = parseNonNegativeInteger(values.loyaltyPointsValue);
  const errors: ServiceFormErrors = {};

  if (!trimmedName) {
    errors.name = t('createNameRequired');
  } else if (trimmedName.length > 100) {
    errors.name = t('createNameMax');
  }

  if (trimmedDescription.length > 500) {
    errors.description = t('createDescriptionMax');
  }

  if (values.priceAmount.trim() === '') {
    errors.priceAmount = t('createPriceRequired');
  } else if (!Number.isFinite(price) || price <= 0) {
    errors.priceAmount = t('createPriceInvalid');
  }

  if (values.durationMinutes.trim() === '') {
    errors.durationMinutes = t('createDurationRequired');
  } else if (!Number.isInteger(duration) || duration <= 0) {
    errors.durationMinutes = t('createDurationInvalid');
  }

  if (points === null) {
    errors.loyaltyPointsValue = t('createPointsInvalid');
  }

  return {
    errors,
    normalized:
      Object.keys(errors).length > 0
        ? null
        : {
            name: trimmedName,
            description: trimmedDescription || null,
            priceAmount: price,
            durationMinutes: duration,
            loyaltyPointsValue: points ?? 0,
          },
  };
}
