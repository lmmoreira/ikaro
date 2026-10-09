import { AvailabilityAlert } from '../../domain/availability-alert.aggregate';
import {
  AvailabilityAlertAttemptOutcome,
  AvailabilityAlertMatchingWindow,
} from '../../domain/availability-alert.types';

export const AVAILABILITY_ALERT_REPOSITORY = Symbol('IAvailabilityAlertRepository');

export interface IAvailabilityAlertRepository {
  findById(id: string, tenantId: string): Promise<AvailabilityAlert | null>;
  // The caller's own alerts, newest first, at most `limit` (history included).
  findByCustomer(tenantId: string, customerId: string, limit: number): Promise<AvailabilityAlert[]>;
  // Currently-ACTIVE alerts of one customer — the per-customer cap check. Must be called from
  // inside the same transaction as the ITenantLockPort.lockCustomerAlerts() acquisition that
  // precedes it, so the count-then-insert sequence is race-safe.
  countActiveByCustomer(tenantId: string, customerId: string): Promise<number>;
  // The expiry job's read: ACTIVE alerts whose expiresAt has passed, oldest first, tenant-scoped
  // (the (tenant_id, status, expires_at) index serves it).
  findActiveExpired(tenantId: string, now: Date): Promise<AvailabilityAlert[]>;
  // The matching read (M23-S07): the service's ACTIVE alerts that have not reached their expiry,
  // oldest first, tenant-scoped (the (tenant_id, service_id, status) index serves it).
  findActiveByService(tenantId: string, serviceId: string, now: Date): Promise<AvailabilityAlert[]>;
  // The sweep's read: the distinct services of the tenant that have at least one ACTIVE alert not
  // yet expired — one cheap grouped scan, so the sweep computes availability per service, never
  // per alert.
  findServiceIdsWithActiveAlerts(tenantId: string, now: Date): Promise<string[]>;
  // Retention purge: hard-deletes the tenant's finished alerts (any status but ACTIVE) whose
  // expiresAt is before `cutoff`, together with their notification attempts, in one transaction.
  // Returns how many alerts were deleted. An ACTIVE alert is never touched.
  deleteFinishedExpiredBefore(tenantId: string, cutoff: Date): Promise<number>;
  // M23-S38: the Notification context's report on the EMAIL attempt of (alert, matching window).
  // One atomic, tenant-scoped UPDATE: counts the try, sets the outcome, stores the redacted reason
  // of a failure and clears it on SENT. Returns false when no such attempt row exists (the alert
  // was purged by retention) so the caller can log it instead of failing.
  recordAttemptOutcome(
    tenantId: string,
    alertId: string,
    matchingWindow: AvailabilityAlertMatchingWindow,
    outcome: Exclude<AvailabilityAlertAttemptOutcome, 'PENDING'>,
    errorMessage: string | null,
  ): Promise<boolean>;
  save(alert: AvailabilityAlert): Promise<void>;
}
