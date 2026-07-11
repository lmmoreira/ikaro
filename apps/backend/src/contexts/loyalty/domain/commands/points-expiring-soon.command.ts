import { Command } from '../../../../shared/domain/command';

interface PointsExpiringSoonData extends Record<string, unknown> {
  customerId: string;
  pointsExpiringSoon: number;
  earliestExpiresAt: string;
}

// A Command, not a fact (TD24-S03): no state change (the weekly cron only computes and warns —
// see docs/03-DOMAIN_EVENTS.md), so a retried/overlapping run must not double-notify. dedupKey
// uses the UTC calendar date of the run (runDate), not a tenant-local one: unlike the two booking
// jobs, this job has no existing tenant-timezone lookup (it iterates LoyaltyEntry rows grouped by
// tenantId, not Tenant records with a timezone field) — and at a weekly cadence the UTC-vs-local
// midnight boundary is immaterial to what this key protects against (a retry landing on the same
// calendar day as the original attempt).
export class PointsExpiringSoon extends Command<PointsExpiringSoonData> {
  readonly eventVersion = 1;
  readonly data: PointsExpiringSoonData;

  constructor(
    tenantId: string,
    correlationId: string,
    data: PointsExpiringSoonData,
    runDate: string,
  ) {
    super(tenantId, correlationId, `PointsExpiringSoon:${tenantId}:${data.customerId}:${runDate}`);
    this.data = data;
  }
}
