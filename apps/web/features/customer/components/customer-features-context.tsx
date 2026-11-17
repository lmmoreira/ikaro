'use client';

import { createContext, useContext } from 'react';
import type { CustomerFeatureKey } from '@ikaro/types';

// The customer-facing features the tenant holds; `null` when unknown (a failed read), which means
// "every feature is available" so a hiccup never hides a surface.
const CustomerFeaturesContext = createContext<readonly CustomerFeatureKey[] | null>(null);

interface CustomerFeaturesProviderProps {
  readonly entitledFeatures: readonly CustomerFeatureKey[] | null;
  readonly children: React.ReactNode;
}

export function CustomerFeaturesProvider({
  entitledFeatures,
  children,
}: CustomerFeaturesProviderProps): React.JSX.Element {
  return (
    <CustomerFeaturesContext.Provider value={entitledFeatures}>
      {children}
    </CustomerFeaturesContext.Provider>
  );
}

/** `true` unless the tenant is known not to hold `feature`; also `true` outside a provider. */
export function useHasCustomerFeature(feature: CustomerFeatureKey): boolean {
  const entitledFeatures = useContext(CustomerFeaturesContext);
  return entitledFeatures === null || entitledFeatures.includes(feature);
}
