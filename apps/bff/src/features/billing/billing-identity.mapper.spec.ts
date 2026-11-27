import { BillingIdentityBuilder } from '../../test/builders/billing-identity.builder';
import {
  toBillingIdentityResponse,
  toBillingIdentitySavedResponse,
} from './billing-identity.mapper';

describe('billing identity mapper (UC-118)', () => {
  it('maps the identity field by field, the tax id as the backend normalised it', () => {
    const backend = new BillingIdentityBuilder().build();

    expect(toBillingIdentitySavedResponse(backend)).toEqual(backend);
  });

  it('maps an empty identity as nulls', () => {
    const empty = new BillingIdentityBuilder().empty().build();

    expect(toBillingIdentityResponse(empty)).toEqual(empty);
  });

  it('answers the provisioning window as its own shape', () => {
    expect(toBillingIdentityResponse({ provisioning: true })).toEqual({ provisioning: true });
  });

  it('copies the address instead of sharing the parsed object', () => {
    const backend = new BillingIdentityBuilder().build();

    const mapped = toBillingIdentitySavedResponse(backend);

    expect(mapped.address).not.toBe(backend.address);
  });
});
