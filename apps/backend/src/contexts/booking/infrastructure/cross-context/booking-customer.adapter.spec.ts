import { Address } from '../../../../shared/value-objects/address';
import { GetCustomerByIdUseCase } from '../../../customer/application/use-cases/get-customer-by-id.use-case';
import { CustomerNotFoundError } from '../../../customer/domain/errors/customer-domain.error';
import { BookingCustomerAdapter } from './booking-customer.adapter';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const CUSTOMER_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

describe('BookingCustomerAdapter', () => {
  let getCustomerById: jest.Mocked<Pick<GetCustomerByIdUseCase, 'execute'>>;
  let adapter: BookingCustomerAdapter;

  beforeEach(() => {
    getCustomerById = { execute: jest.fn() };
    adapter = new BookingCustomerAdapter(getCustomerById as unknown as GetCustomerByIdUseCase);
  });

  it('returns customer profile with reconstructed default address', async () => {
    getCustomerById.execute.mockResolvedValue({
      id: CUSTOMER_ID,
      tenantId: TENANT_ID,
      email: 'cliente@lavacar.com.br',
      name: 'Cliente Silva',
      phone: '31999999999',
      defaultAddress: {
        street: 'Rua A',
        number: '123',
        neighborhood: 'Centro',
        city: 'Belo Horizonte',
        state: 'MG',
        zipCode: '30100000',
      },
    });

    const result = await adapter.findById(CUSTOMER_ID, TENANT_ID);

    expect(result).toMatchObject({
      email: 'cliente@lavacar.com.br',
      name: 'Cliente Silva',
      phone: '31999999999',
    });
    expect(result?.defaultAddress).toBeInstanceOf(Address);
    expect(getCustomerById.execute).toHaveBeenCalledWith({ customerId: CUSTOMER_ID, tenantId: TENANT_ID });
  });

  it('returns null when customer is not found', async () => {
    getCustomerById.execute.mockRejectedValue(new CustomerNotFoundError(CUSTOMER_ID));

    const result = await adapter.findById(CUSTOMER_ID, TENANT_ID);

    expect(result).toBeNull();
  });
});
