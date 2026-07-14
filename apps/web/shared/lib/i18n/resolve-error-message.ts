import type { ProblemDetail } from '@ikaro/types';
import enErrors from '@ikaro/i18n/locales/en/errors.json';
import ptBrErrors from '@ikaro/i18n/locales/pt-BR/errors.json';
import { ApiError, ForbiddenError } from '@/shared/lib/api/errors';
import type { SupportedLocale } from './get-messages';

type ErrorParams = Record<string, string | number>;

const CATALOGS: Record<SupportedLocale, Record<string, string>> = {
  en: enErrors,
  'pt-BR': ptBrErrors,
};

const FALLBACK_MESSAGE: Record<SupportedLocale, string> = {
  en: 'Something went wrong. Please try again.',
  'pt-BR': 'Algo deu errado. Tente novamente.',
};

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

function interpolate(template: string, params: ErrorParams): string {
  return template.replace(PLACEHOLDER_PATTERN, (match, key: string) =>
    Object.hasOwn(params, key) ? String(params[key]) : match,
  );
}

// Dev-only substitute for compile-time code->params-shape binding (TD23 Story 12) — catches a
// silently missing/extra interpolation variable during development instead of shipping it.
function warnOnPlaceholderMismatch(code: string, template: string, params: ErrorParams): void {
  if (process.env.NODE_ENV === 'production') return;

  const placeholders = new Set(Array.from(template.matchAll(PLACEHOLDER_PATTERN), (m) => m[1]));
  const paramKeys = new Set(Object.keys(params));

  for (const key of placeholders) {
    if (!paramKeys.has(key)) {
      // eslint-disable-next-line no-console -- deliberate dev-mode observability signal (TD23 §Story 12)
      console.warn(
        `[resolveErrorMessage] "${code}" translation references "{${key}}" but no matching param was passed.`,
      );
    }
  }
  for (const key of paramKeys) {
    if (!placeholders.has(key)) {
      // eslint-disable-next-line no-console -- deliberate dev-mode observability signal (TD23 §Story 12)
      console.warn(
        `[resolveErrorMessage] "${code}" was called with param "${key}" that has no matching placeholder in its translation.`,
      );
    }
  }
}

// The only thing frontend message-selection is allowed to branch on (TD23 §5) — never `status`,
// `.detail`, or raw backend text. An unrecognized `code` falls back to a generic message and
// warns, so client/server version skew is observable instead of silently swallowed (TD23 §7).
export function resolveErrorMessage(
  code: string | undefined,
  locale: SupportedLocale,
  params: ErrorParams = {},
): string {
  const template = code ? CATALOGS[locale][code] : undefined;

  if (!code || !template) {
    // eslint-disable-next-line no-console -- deliberate observability signal for a code/locale gap (TD23 §7)
    console.warn(
      `[resolveErrorMessage] Unrecognized error code "${code}" — using fallback message.`,
    );
    return FALLBACK_MESSAGE[locale];
  }

  warnOnPlaceholderMismatch(code, template, params);
  return interpolate(template, params);
}

// Extracts `code` from the two bffClient-backed error classes that carry a parsed ProblemDetail
// body (TD23 Story 15) — `ApiError` (any 401/409/422/500/... response) and `ForbiddenError` (403
// specifically, its own class since bff-client.ts's interceptor branches 403 separately). Both
// attach the body via `.data`. Anything else (a plain `Error`, a network failure, `AuthError`) has
// no code to extract and resolves to the generic fallback message downstream.
export function extractProblemCode(err: unknown): string | undefined {
  if (err instanceof ApiError || err instanceof ForbiddenError) {
    return (err.data as ProblemDetail | undefined)?.code;
  }
  return undefined;
}

// Shared shape for the `ApiError`/`ForbiddenError` → `ProblemDetail.code` → `resolveErrorMessage`
// chain repeated across every BFF-backed mutation handler in the dashboard (reschedule, schedule
// sheets, service create/edit, staff invite/update/deactivate, ...). One extraction point instead
// of a copy at each call site — a call site that skips it (e.g. only catching `err instanceof
// Error`) silently regresses to showing raw backend text instead of a resolved catalog message.
export function resolveErrorMessageFromApiError(err: unknown, locale: SupportedLocale): string {
  return resolveErrorMessage(extractProblemCode(err), locale);
}
