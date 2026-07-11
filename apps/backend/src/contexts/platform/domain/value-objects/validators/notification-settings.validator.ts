import { PlatformErrorCode } from '@ikaro/types';
import { Email } from '../../../../../shared/value-objects/email.vo';
import type { NotificationSettings } from '../../../../../shared/value-objects/tenant-settings-data';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';

export class NotificationSettingsValidator {
  static validate(notification: NotificationSettings | undefined): void {
    if (notification?.fromEmail != null && !Email.isValid(notification.fromEmail)) {
      throw new TenantSettingsValidationError(
        'notification.fromEmail must be a valid email address',
        PlatformErrorCode.SETTINGS_NOTIFICATION_EMAIL_INVALID,
        'notification.fromEmail',
      );
    }
  }
}
