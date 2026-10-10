import { Address, AddressProps } from '../../../../shared/value-objects/address';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import {
  BookingCustomerNotFoundError,
  BookingServiceNotActiveError,
  BookingServiceNotInTenantError,
  BookingServiceSessionNotBookableError,
  CustomerPhoneNotSetError,
} from '../../domain/errors/booking-domain.error';
import { Service } from '../../domain/service.aggregate';
import { IBookingCustomerPort, CustomerProfileDto } from '../ports/booking-customer.port';
import { IServiceRepository } from '../ports/service-repository.port';
import { createBookingAddress } from './booking-request.helpers';

// Who and what a booking request is for — the steps the guest, authenticated and staff entry points
// share before any booking is built (booking-request.helpers.ts holds the persistence side).

type PickupAddressInput = Omit<AddressProps, 'complement'> & { complement?: string | null };

// The services a booking request names must exist in the tenant, be active, and be APPOINTMENT
// services (class sessions are enrolled through UC-104). Shared by the guest, authenticated and
// staff entry points — never copied per use case.
export async function resolveBookableServices(
  serviceRepo: IServiceRepository,
  serviceIds: string[],
  tenantId: string,
): Promise<Map<string, Service>> {
  const services = await serviceRepo.findByIds(serviceIds, tenantId);
  const serviceMap = new Map(services.map((s) => [s.id, s]));
  for (const serviceId of new Set(serviceIds)) {
    const service = serviceMap.get(serviceId);
    if (!service) throw new BookingServiceNotInTenantError(serviceId);
    if (!service.isActive) throw new BookingServiceNotActiveError(serviceId);
    if (service.bookingModel !== 'APPOINTMENT') {
      throw new BookingServiceSessionNotBookableError(serviceId);
    }
  }
  return serviceMap;
}

// A booking made for an existing customer needs the customer's contact snapshot, and a phone — the
// business has to be able to reach the person (UC-002, UC-108).
export async function findCustomerWithPhone(
  customerPort: IBookingCustomerPort,
  customerId: string,
  tenantId: string,
): Promise<CustomerProfileDto & { phone: string }> {
  const customer = await customerPort.findById(customerId, tenantId);
  if (!customer) throw new BookingCustomerNotFoundError(customerId);
  if (!customer.phone) throw new CustomerPhoneNotSetError();
  return customer as CustomerProfileDto & { phone: string };
}

// The request's pickup address when present; otherwise the customer's default address, but only
// when some line actually requires pickup. A guest has no default (`fallback` omitted), so a
// missing address is left for Booking to refuse.
export function resolvePickupAddress(
  requested: PickupAddressInput | undefined,
  fallback: Address | null | undefined,
  countryCode: string,
  serviceIds: string[],
  serviceMap: Map<string, Service>,
): Address | undefined {
  if (requested) {
    return createBookingAddress(
      { ...requested, complement: requested.complement ?? undefined },
      CountryCode.create(countryCode).spec.address,
      'pickupAddress',
    );
  }
  const requiresPickup = serviceIds.some((id) => serviceMap.get(id)?.requiresPickupAddress);
  return requiresPickup && fallback ? fallback : undefined;
}
