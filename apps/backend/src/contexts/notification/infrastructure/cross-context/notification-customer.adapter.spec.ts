import { GetCustomerByIdUseCase } from '../../../customer/application/use-cases/get-customer-by-id.use-case';
import { CustomerNotFoundError } from '../../../customer/domain/errors/customer-domain.error';
import { NotificationCustomerAdapter } from './notification-customer.adapter';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const CUSTOMER_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

describe('NotificationCustomerAdapter', () => {
  let getCustomerById: jest.Mocked<Pick<GetCustomerByIdUseCase, 'execute'>>;
  let adapter: NotificationCustomerAdapter;

  beforeEach(() => {
    getCustomerById = { execute: jest.fn() };
    adapter = new NotificationCustomerAdapter(getCustomerById as unknown as GetCustomerByIdUseCase);
  });

  afterEach(() => jest.resetAllMocks());

  it('returns email and name when customer is found', async () => {
    getCustomerById.execute.mockResolvedValue({
      id: CUSTOMER_ID,
      tenantId: TENANT_ID,
      email: 'maria@example.com',
      name: 'Maria Silva',
      phone: null,
      defaultAddress: null,
    });

    const result = await adapter.getCustomerInfo(CUSTOMER_ID, TENANT_ID);

    expect(result).toEqual({ email: 'maria@example.com', name: 'Maria Silva' });
    expect(getCustomerById.execute).toHaveBeenCalledWith({
      customerId: CUSTOMER_ID,
      tenantId: TENANT_ID,
    });
  });

  it('returns null when customer is not found', async () => {
    getCustomerById.execute.mockRejectedValue(new CustomerNotFoundError(CUSTOMER_ID));

    const result = await adapter.getCustomerInfo(CUSTOMER_ID, TENANT_ID);

    expect(result).toBeNull();
  });

  it('returns null when use case throws', async () => {
    getCustomerById.execute.mockRejectedValue(new Error('DB error'));

    const result = await adapter.getCustomerInfo(CUSTOMER_ID, TENANT_ID);

    expect(result).toBeNull();
  });
});
