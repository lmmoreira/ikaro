import { NotificationDomainError } from './notification-domain.error';

// A platform-scoped template (Billing's manager emails) has no row for the requested locale. Raised by
// findPlatformTemplate; the send use case logs it as billing_template_missing and rethrows (UC-124 A1).
export class PlatformTemplateNotFoundError extends NotificationDomainError {
  constructor(
    readonly triggerEvent: string,
    readonly locale: string,
  ) {
    super(`No platform template for "${triggerEvent}" in locale "${locale}"`);
    this.name = 'PlatformTemplateNotFoundError';
  }
}
