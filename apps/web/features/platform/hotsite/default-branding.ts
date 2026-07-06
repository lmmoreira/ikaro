import type { HotsiteBrandingResponse } from '@ikaro/types';

// Mirrors DEFAULT_HOTSITE_BRANDING in apps/backend/src/contexts/platform/domain/hotsite-config.aggregate.ts
// — the palette every freshly-provisioned tenant starts with. Used as the fallback style for
// pages outside the [slug]/ tree (e.g. /bookings/:id/submit-info) when no tenant manifest is
// resolvable, so the page never renders with zero --ba-* values (globals.css defines none).
export const DEFAULT_HOTSITE_BRANDING: HotsiteBrandingResponse = {
  primaryColor: '#2563EB',
  secondaryColor: '#EFF6FF',
  backgroundColor: '#FFFFFF',
  textColor: '#111827',
  headingFontFamily: 'Inter, sans-serif',
  bodyFontFamily: 'Inter, sans-serif',
  logoUrl: '',
  borderRadius: 'rounded',
  buttonStyle: 'filled',
  spacing: 'comfortable',
  shadowStyle: 'subtle',
};
