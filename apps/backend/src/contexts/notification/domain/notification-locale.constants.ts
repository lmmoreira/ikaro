// Fallback locale when a tenant's settings.localization.language is unavailable
// (e.g. tenant lookup failed). Keeping this in one place avoids the literal
// 'pt-BR' drifting independently across every send-*-notification use case.
export const DEFAULT_LOCALE = 'pt-BR';
