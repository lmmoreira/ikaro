export { loginAsCustomer } from './customer-login';
export { loginAsStaff } from './staff-login';

// A fresh, unique email per call — guarantees a brand-new customer row (phone/defaultAddress
// both null) rather than reusing one a previous test run may have already completed.
export function uniqueTestEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@e2e.example.com`;
}
