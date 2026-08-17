import { BackendHttpService } from '../../shared/http/backend-http.service';
import { AppLogger } from '../../shared/observability/app-logger';
import { LoyaltyBalanceResponse } from '../loyalty/loyalty.types';

// Split out of bookings.controller.ts to keep it under the file-length cap — best-effort loyalty
// balance lookup for the staff-facing booking detail view; a failure here must not break the
// booking detail response itself.
export async function fetchLoyaltyBalanceForStaffBookingDetail(
  backendHttp: BackendHttpService,
  logger: AppLogger,
  customerId: string,
): Promise<number | null> {
  try {
    const balance = await backendHttp.get<LoyaltyBalanceResponse>(
      `/customers/${customerId}/loyalty/balance`,
    );
    return balance.currentPoints;
  } catch (err) {
    logger.error('Failed to fetch loyalty balance for staff booking detail', undefined, {
      customerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
