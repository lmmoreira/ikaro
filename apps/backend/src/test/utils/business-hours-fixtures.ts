import { BusinessHours } from '../../shared/value-objects/business-hours.vo';

// Reused by Resource-related specs that need a tenant BusinessHours input — Mon–Fri 09:00–18:00,
// weekend closed. Kept here rather than a builder since it's a plain fixture, not an aggregate.
export const FULL_WEEK_BUSINESS_HOURS: BusinessHours = {
  timezone: 'America/Sao_Paulo',
  monday: { open: '09:00', close: '18:00' },
  tuesday: { open: '09:00', close: '18:00' },
  wednesday: { open: '09:00', close: '18:00' },
  thursday: { open: '09:00', close: '18:00' },
  friday: { open: '09:00', close: '18:00' },
  saturday: null,
  sunday: null,
};

export const EMPTY_BUSINESS_HOURS: BusinessHours = {
  timezone: 'America/Sao_Paulo',
  monday: null,
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
};
