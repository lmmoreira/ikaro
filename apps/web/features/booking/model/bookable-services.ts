import type { HotsiteServiceResponse } from '@ikaro/types';

/** The services the booking flow offers: the appointment family (classes and sessions book elsewhere). */
export function filterBookableServices(
  services: readonly HotsiteServiceResponse[],
): HotsiteServiceResponse[] {
  return services.filter((service) => service.bookingModel === 'APPOINTMENT');
}
