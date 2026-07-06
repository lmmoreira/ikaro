import { z } from 'zod';
import type { StaffRole } from '@ikaro/types';

export type InviteFormTranslator = (key: string) => string;

export interface InviteFormValues {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly role: StaffRole;
}

export interface NormalizedInviteFormValues {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly role: StaffRole;
}

export interface InviteFormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  submit?: string;
}

const EMAIL_SCHEMA = z.email();

export function validateInviteForm(
  values: InviteFormValues,
  t: InviteFormTranslator,
): {
  readonly errors: InviteFormErrors;
  readonly normalized: NormalizedInviteFormValues | null;
} {
  const trimmedFirstName = values.firstName.trim();
  const trimmedLastName = values.lastName.trim();
  const trimmedEmail = values.email.trim();
  const errors: InviteFormErrors = {};

  if (!trimmedFirstName) {
    errors.firstName = t('errors.firstNameRequired');
  }

  if (!trimmedLastName) {
    errors.lastName = t('errors.lastNameRequired');
  }

  if (!EMAIL_SCHEMA.safeParse(trimmedEmail).success) {
    errors.email = t('errors.emailInvalid');
  }

  return {
    errors,
    normalized:
      Object.keys(errors).length > 0
        ? null
        : {
            firstName: trimmedFirstName,
            lastName: trimmedLastName,
            email: trimmedEmail,
            role: values.role,
          },
  };
}
