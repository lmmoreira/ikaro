import { PlatformErrorCode } from '@ikaro/types';
import { Email } from '../../../../../shared/value-objects/email.vo';
import { PhoneNumber } from '../../../../../shared/value-objects/phone-number.vo';
import type {
  BusinessInfo,
  SocialLinks,
} from '../../../../../shared/value-objects/tenant-settings-data';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';

export class BusinessInfoValidator {
  static validate(businessInfo: BusinessInfo | undefined): void {
    if (!businessInfo) return;
    if (businessInfo.phone != null && !PhoneNumber.isValid(businessInfo.phone)) {
      throw new TenantSettingsValidationError(
        'businessInfo.phone must be a valid phone number',
        PlatformErrorCode.SETTINGS_BUSINESS_PHONE_INVALID,
        'businessInfo.phone',
      );
    }
    if (businessInfo.email != null && !Email.isValid(businessInfo.email)) {
      throw new TenantSettingsValidationError(
        'businessInfo.email must be a valid email address',
        PlatformErrorCode.SETTINGS_BUSINESS_EMAIL_INVALID,
        'businessInfo.email',
      );
    }
    BusinessInfoValidator.validateSocialLinks(businessInfo.socialLinks);
  }

  private static validateSocialLinks(socialLinks: SocialLinks | null): void {
    if (socialLinks == null) return;
    if (socialLinks.whatsapp != null && !PhoneNumber.isValid(socialLinks.whatsapp)) {
      throw new TenantSettingsValidationError(
        'businessInfo.socialLinks.whatsapp must be a valid phone number',
        PlatformErrorCode.SETTINGS_SOCIAL_WHATSAPP_INVALID,
        'businessInfo.socialLinks.whatsapp',
      );
    }
  }
}
