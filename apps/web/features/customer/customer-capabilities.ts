import type { CustomerFeatureKey } from '@ikaro/types';

// What the customer's account knows about the tenant it is signed in to, read from the one access
// answer (`GET /v1/billing/access`, role-reduced for a customer; UC-121, UC-125).
export interface CustomerTenantAccess {
  // `false` while the tenant is suspended. An unreadable answer is `true`: a failed read is never a
  // suspension (fail open).
  readonly operational: boolean;
  // The customer-facing features the tenant holds; `null` when unknown (a failed read), which means
  // "every feature is held" so a hiccup never hides a surface.
  readonly entitledFeatures: readonly CustomerFeatureKey[] | null;
}

// Fail open: an account rendered outside a provider, or before any answer, behaves as today.
export const DEFAULT_CUSTOMER_TENANT_ACCESS: CustomerTenantAccess = {
  operational: true,
  entitledFeatures: null,
};

// The "+ Novo" menu has three states, and they must not be mixed (docs/ENGINEERING_RULES_FRONTEND.md
// § A surface of a missing feature or a suspended tenant): absent for a tenant that cannot offer
// the surface at all (no `BOOKING`), disabled for a state that will end (suspended), offered
// otherwise.
type NewBookingMenuState = 'offered' | 'disabled' | 'absent';

// What the customer's account may offer, decided once from the tenant's state so no component asks
// "is the tenant suspended?" or "does it hold BOOKING?" itself. Each capability is one named
// decision: adding a feature or a state is one line here, not an edit in every component that
// reacts to it. A suspended tenant keeps every read (UC-121) and a future booking can still be
// cancelled; what it loses is everything that creates or changes a booking.
export interface CustomerCapabilities {
  // The neutral "Empresa inativa" notice and badge.
  readonly showInactiveNotice: boolean;
  // A link or button that starts a new booking (an empty state, a closed booking, the points page).
  readonly canStartBooking: boolean;
  // The topbar's and the pages' "+ Novo" menu.
  readonly newBookingMenu: NewBookingMenuState;
  // The booking's "Responder" and its information form.
  readonly canRespondToInfoRequest: boolean;
  // The booking's "Reagendar".
  readonly canReschedule: boolean;
  // The two entry rows of the bookings list (recurring reservations, availability alerts): their
  // reads are refused while the tenant is suspended.
  readonly offersRecurringAndAlerts: boolean;
  // The link from a booking to the recurring schedule it came from: that page is refused while the
  // tenant is suspended.
  readonly canManageRecurring: boolean;
}

// Absent wins over disabled: a tenant that cannot offer the surface at all shows no disabled stub.
function newBookingMenuState(holdsBooking: boolean, operational: boolean): NewBookingMenuState {
  if (!holdsBooking) return 'absent';
  return operational ? 'offered' : 'disabled';
}

export function resolveCustomerCapabilities({
  operational,
  entitledFeatures,
}: CustomerTenantAccess): CustomerCapabilities {
  const holdsBooking = entitledFeatures === null || entitledFeatures.includes('BOOKING');

  return {
    showInactiveNotice: !operational,
    canStartBooking: operational,
    newBookingMenu: newBookingMenuState(holdsBooking, operational),
    canRespondToInfoRequest: operational,
    canReschedule: operational,
    offersRecurringAndAlerts: operational,
    canManageRecurring: operational,
  };
}
