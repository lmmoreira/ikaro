import { GetCustomerByIdUseCaseResult } from '../../application/use-cases/get-customer-by-id.use-case';

export type GetCustomerProfileResponse = {
  customerId: string;
  email: string;
  name: string;
  phone: string | null;
  defaultAddress: GetCustomerByIdUseCaseResult['defaultAddress'];
};

export function toGetCustomerProfileResponse(
  customer: GetCustomerByIdUseCaseResult,
): GetCustomerProfileResponse {
  return {
    customerId: customer.id,
    email: customer.email,
    name: customer.name,
    phone: customer.phone,
    defaultAddress: customer.defaultAddress,
  };
}
