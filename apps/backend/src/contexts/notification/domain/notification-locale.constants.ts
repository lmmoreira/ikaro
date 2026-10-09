// Fallback locale when a tenant's settings.localization.language is unavailable
// (e.g. tenant lookup failed). Keeping this in one place avoids the literal
// 'pt-BR' drifting independently across every send-*-notification use case.
export const DEFAULT_LOCALE = 'pt-BR';

// Fallback formats when the tenant lookup failed, matching DEFAULT_LOCALE (a Brazilian tenant).
export const DEFAULT_DATE_FORMAT = 'DD/MM/YYYY';
export const DEFAULT_TIME_FORMAT = '24h';
