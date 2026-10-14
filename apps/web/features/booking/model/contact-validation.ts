import { z } from 'zod';

const EMAIL_SCHEMA = z.email();

export type ContactField = 'name' | 'email' | 'phone';

export interface ContactValue {
  readonly contactName: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
}

/**
 * The first contact field that is missing or malformed, or null — the rule of the hotsite's
 * personal step and of the staff "Novo contato": a name, a valid e-mail and a phone, all required.
 */
export function findContactError(value: ContactValue): ContactField | null {
  if (!value.contactName.trim()) return 'name';
  if (!EMAIL_SCHEMA.safeParse(value.contactEmail).success) return 'email';
  if (!value.contactPhone.trim()) return 'phone';
  return null;
}
