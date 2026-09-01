import type { DayHours } from '../../../shared/value-objects/business-hours.vo';

export enum ResourceType {
  LOCATION = 'LOCATION',
  STAFF = 'STAFF',
  ROOM = 'ROOM',
  EQUIPMENT = 'EQUIPMENT',
}

// Same per-weekday shape as tenants.settings.businessHours, without a `timezone` key —
// a Resource always inherits the tenant's own timezone (docs/02-DOMAIN_MODEL.md § Resource).
export interface ResourceWorkingHours {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}
