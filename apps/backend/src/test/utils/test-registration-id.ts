/**
 * A syntactically valid Billing `registrationId` for specs that create a tenant through
 * `POST /internal/tenants`. Platform checks only the shape of the id and never reads Billing, and
 * those test apps register no Billing handler, so the registration need not exist.
 */
export const TEST_REGISTRATION_ID = '0198f1c2-7a3b-7c4d-8e5f-0123456789ab';
