import enErrors from '@ikaro/i18n/locales/en/errors.json';
import ptBrErrors from '@ikaro/i18n/locales/pt-BR/errors.json';
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
    key in params ? String(params[key]) : match,
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
