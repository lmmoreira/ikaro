export interface BusinessHours {
  open: string; // "HH:MM"
  close: string; // "HH:MM"
  closed: boolean;
}

export interface TenantSettings {
  timezone: string;
  booking: {
    cancellationWindowHours: number;
    maxAdvanceBookingDays: number;
  };
  loyalty: {
    expiryDays: number;
  };
  businessHours: {
    monday: BusinessHours;
    tuesday: BusinessHours;
    wednesday: BusinessHours;
    thursday: BusinessHours;
    friday: BusinessHours;
    saturday: BusinessHours;
    sunday: BusinessHours;
  };
}

export interface UpdateTenantSettingsRequest {
  settings: Partial<TenantSettings>;
}
