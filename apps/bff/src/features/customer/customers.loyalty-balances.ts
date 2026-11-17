import { BackendHttpService } from '../../shared/http/backend-http.service';
import { isFeatureNotEntitled } from '../../shared/http/feature-not-entitled';
import { LoyaltyBalanceItem } from './customers.types';

// The points shown beside a customer-search result are an enrichment, not part of the customer: a
// tenant without LOYALTY has none, and the backend refuses its balances read with
// BILLING_FEATURE_NOT_ENTITLED. That one denial means "no points"; any other failure still surfaces.
export async function fetchLoyaltyBalancesForSearch(
  backendHttp: BackendHttpService,
  customerIds: readonly string[],
): Promise<LoyaltyBalanceItem[]> {
  try {
    return await backendHttp.get<LoyaltyBalanceItem[]>('/loyalty/balances', {
      customerIds: customerIds.join(','),
    });
  } catch (err) {
    if (isFeatureNotEntitled(err)) return [];
    throw err;
  }
}
