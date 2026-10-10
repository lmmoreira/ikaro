import { InMemoryBookingCustomerPort } from '../../../../test/infrastructure/in-memory-booking-customer.port';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { testAddress, testAddressProps } from '../../../../test/utils/address-helpers';
import {
  BookingCustomerNotFoundError,
  BookingServiceNotActiveError,
  BookingServiceNotInTenantError,
  BookingServiceSessionNotBookableError,
  CustomerPhoneNotSetError,
} from '../../domain/errors/booking-domain.error';
import {
  findCustomerWithPhone,
  resolveBookableServices,
  resolvePickupAddress,
} from './booking-request-subject.helpers';

const TENANT_A = '10000000-0000-4000-8000-000000000100';

describe('resolveBookableServices', () => {
  let serviceRepo: InMemoryServiceRepository;

  beforeEach(() => {
    serviceRepo = new InMemoryServiceRepository();
  });

  it('returns the services keyed by id', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);

    const map = await resolveBookableServices(serviceRepo, [service.id, service.id], TENANT_A);

    expect([...map.keys()]).toEqual([service.id]);
  });

  it('rejects a service that is not in the tenant', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);

    await expect(
      resolveBookableServices(serviceRepo, [service.id], '10000000-0000-4000-8000-000000000999'),
    ).rejects.toBeInstanceOf(BookingServiceNotInTenantError);
  });

  it('rejects an inactive service', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).withIsActive(false).build();
    await serviceRepo.save(service);

    await expect(
      resolveBookableServices(serviceRepo, [service.id], TENANT_A),
    ).rejects.toBeInstanceOf(BookingServiceNotActiveError);
  });

  it('rejects a class-session service — sessions are enrolled through UC-104', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).withBookingModel('SESSION').build();
    await serviceRepo.save(service);

    await expect(
      resolveBookableServices(serviceRepo, [service.id], TENANT_A),
    ).rejects.toBeInstanceOf(BookingServiceSessionNotBookableError);
  });
});

describe('findCustomerWithPhone', () => {
  const CUSTOMER_ID = '20000000-0000-4000-8000-000000000100';
  let port: InMemoryBookingCustomerPort;

  beforeEach(() => {
    port = new InMemoryBookingCustomerPort();
  });

  it('returns the profile of a customer who has a phone', async () => {
    port.setProfile(CUSTOMER_ID, {
      email: 'a@example.com',
      name: 'Ana',
      phone: '+5531999999999',
      defaultAddress: null,
    });

    const customer = await findCustomerWithPhone(port, CUSTOMER_ID, TENANT_A);

    expect(customer.phone).toBe('+5531999999999');
  });

  it('throws BookingCustomerNotFoundError for an unknown customer', async () => {
    await expect(findCustomerWithPhone(port, CUSTOMER_ID, TENANT_A)).rejects.toBeInstanceOf(
      BookingCustomerNotFoundError,
    );
  });

  it('throws CustomerPhoneNotSetError for a customer without a phone', async () => {
    port.setProfile(CUSTOMER_ID, {
      email: 'a@example.com',
      name: 'Ana',
      phone: null,
      defaultAddress: null,
    });

    await expect(findCustomerWithPhone(port, CUSTOMER_ID, TENANT_A)).rejects.toBeInstanceOf(
      CustomerPhoneNotSetError,
    );
  });
});

describe('resolvePickupAddress', () => {
  const pickupService = new ServiceBuilder().withRequiresPickupAddress(true).build();
  const plainService = new ServiceBuilder().build();
  const serviceMap = new Map([
    [pickupService.id, pickupService],
    [plainService.id, plainService],
  ]);

  it('builds the requested address when one is sent', () => {
    const result = resolvePickupAddress(
      testAddressProps({ street: 'Rua Digitada' }),
      testAddress(),
      'BR',
      [pickupService.id],
      serviceMap,
    );

    expect(result!.street).toBe('Rua Digitada');
  });

  it('falls back to the default address only when a service requires pickup', () => {
    const fallback = testAddress();

    expect(resolvePickupAddress(undefined, fallback, 'BR', [pickupService.id], serviceMap)).toBe(
      fallback,
    );
    expect(
      resolvePickupAddress(undefined, fallback, 'BR', [plainService.id], serviceMap),
    ).toBeUndefined();
  });

  it('returns nothing for a guest with no address and no default', () => {
    expect(
      resolvePickupAddress(undefined, undefined, 'BR', [pickupService.id], serviceMap),
    ).toBeUndefined();
  });
});
