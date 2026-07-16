import { z } from 'zod';
import { AddressErrorCode } from '@ikaro/types';
import { requiredWithCode } from './required-with-code';

/**
 * Shape-only address schema: type/length constraints, no required-field enforcement.
 * Used wherever a required-ness check is deliberately left to the backend's `Address.create()`
 * VO instead of being duplicated at the schema layer (TD23 Story 13 — two independent
 * required-field checks for the same failure produced two incompatible error shapes; the VO's
 * `{code, field}` rejection is strictly more granular than a Zod `violations[]` entry would be
 * here). `Address.create()` still enforces required-ness downstream — this schema only
 * guards type/shape before the value reaches it.
 */
export const AddressShapeSchema = z.object({
  street: z.string(),
  number: z.string(),
  complement: z.string().nullable().optional(),
  neighborhood: z.string().min(1).optional(),
  city: z.string(),
  state: z.string().trim().max(10),
  zipCode: z.string().trim().max(20),
});

/**
 * Full address shape for contexts that DO want fail-fast required-field rejection at this
 * layer (customer profile updates) — mirrors the backend's `Address` VO's required-field set
 * and reuses its exact error code. Country-specific rules (postal/state pattern) stay
 * backend-only (via `Address.create()` + `AddressSpec`, resolved from the tenant's country) —
 * this schema only enforces the shape both layers already agreed on before this migration.
 */
export const AddressSchema = z.object({
  street: requiredWithCode(z.string(), AddressErrorCode.FIELD_REQUIRED),
  number: requiredWithCode(z.string(), AddressErrorCode.FIELD_REQUIRED),
  complement: z.string().nullable().optional(),
  neighborhood: z.string().min(1).optional(),
  city: requiredWithCode(z.string(), AddressErrorCode.FIELD_REQUIRED),
  state: requiredWithCode(z.string().trim().max(10), AddressErrorCode.FIELD_REQUIRED),
  zipCode: requiredWithCode(z.string().trim().max(20), AddressErrorCode.FIELD_REQUIRED),
});

/**
 * Partial/nullable address shape for PATCH-style settings updates (tenant `businessInfo`),
 * where every field — including the address object itself — may be independently cleared
 * or omitted. No FIELD_REQUIRED enforcement: an empty/null field here means "not set", not
 * "invalid".
 */
export const PartialAddressSchema = z
  .object({
    street: z.string().nullable(),
    number: z.string().nullable(),
    complement: z.string().optional(),
    neighborhood: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().trim().min(1).max(10).nullable(),
    zipCode: z.string().trim().min(1).max(20).nullable(),
  })
  .partial();
