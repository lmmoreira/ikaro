'use client';

import { createContext, useContext, useMemo } from 'react';
import type { CustomerFeatureKey } from '@ikaro/types';
import {
  DEFAULT_CUSTOMER_TENANT_ACCESS,
  resolveCustomerCapabilities,
  type CustomerCapabilities,
  type CustomerTenantAccess,
} from '../customer-capabilities';

const CustomerTenantAccessContext = createContext<CustomerTenantAccess>(
  DEFAULT_CUSTOMER_TENANT_ACCESS,
);

interface CustomerTenantAccessProviderProps {
  readonly operational: boolean;
  readonly entitledFeatures: readonly CustomerFeatureKey[] | null;
  readonly children: React.ReactNode;
}

// The tenant's state, provided once by the account shell, so a component deep in the tree asks for
// a capability instead of receiving `tenantOperational` as a prop through every layer between.
export function CustomerTenantAccessProvider({
  operational,
  entitledFeatures,
  children,
}: CustomerTenantAccessProviderProps): React.JSX.Element {
  const value = useMemo(() => ({ operational, entitledFeatures }), [operational, entitledFeatures]);

  return (
    <CustomerTenantAccessContext.Provider value={value}>
      {children}
    </CustomerTenantAccessContext.Provider>
  );
}

/** The tenant's state; fail open (operational, every feature) outside a provider. */
export function useCustomerTenantAccess(): CustomerTenantAccess {
  return useContext(CustomerTenantAccessContext);
}

/** What the account may offer for the tenant's state (see `resolveCustomerCapabilities`). */
export function useCustomerCapabilities(): CustomerCapabilities {
  const access = useCustomerTenantAccess();

  return useMemo(() => resolveCustomerCapabilities(access), [access]);
}
