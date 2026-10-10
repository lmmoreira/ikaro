import { CreateBookingByStaffBody, CreateBookingByStaffSchema } from '@ikaro/validation';

// M23-S39 (UC-108) — the schema is shared with the BFF (packages/validation/src/booking.ts), which
// validates the same body before forwarding it.
export { CreateBookingByStaffSchema };

export type CreateBookingByStaffDto = CreateBookingByStaffBody;
