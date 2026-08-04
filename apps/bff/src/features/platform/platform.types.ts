import {
  HotsiteBookingSettingsResponse,
  HotsiteBusinessInfoResponse,
  HotsiteLocalizationResponse,
  HotsiteResponse,
} from '@ikaro/types';

export type BackendHotsiteManifestResponse = HotsiteResponse & {
  business: HotsiteBusinessInfoResponse;
  localization: HotsiteLocalizationResponse;
  booking: HotsiteBookingSettingsResponse;
};
