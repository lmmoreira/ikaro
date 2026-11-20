// The creation lease (docs/LOCK_CATALOG.md B-C1, "Not taken by the creation claim"). Only an open
// charge (`PENDING` / `OVERDUE`) is claimed: a charge cancelled or paid before its creation must
// never get a provider bill. The nested
// sub-select is where `FOR UPDATE SKIP LOCKED` is valid; a caller that finds the row locked simply
// updates nothing and is not the owner. `$3` is the caller's `IClock.now()`, not the database
// `now()`, so the dev clock and the lease tests need no sleeping.
export const CLAIM_FOR_PROVIDER_CREATION_SQL = `
  UPDATE "billing"."charges"
  SET "provider_creation_last_attempt_at" = $3::timestamptz,
      "provider_creation_attempts" = "provider_creation_attempts" + 1
  WHERE "tenant_id" = $1 AND "id" = (
    SELECT "id" FROM "billing"."charges"
    WHERE "tenant_id" = $1 AND "id" = $2
      AND "status" IN ('PENDING', 'OVERDUE')
      AND "provider_creation_status" = 'PENDING'
      AND "provider_charge_id" IS NULL
      AND ("provider_creation_last_attempt_at" IS NULL
        OR "provider_creation_last_attempt_at" < $3::timestamptz - ($4::int * interval '1 minute'))
    FOR UPDATE SKIP LOCKED
  )
  RETURNING "id"
`;

// The keyset of the creation retry's order (`provider_creation_last_attempt_at` NULLS FIRST, then
// id): the rows after the last one of the previous page. Never-attempted charges (NULL) come first.
export function afterPendingCreation(after: {
  id: string;
  lastAttemptAt: Date | null;
}): [string, Record<string, unknown>] {
  if (after.lastAttemptAt === null) {
    return [
      '(c.providerCreationLastAttemptAt IS NOT NULL OR c.id > :afterId)',
      { afterId: after.id },
    ];
  }
  return [
    `(c.providerCreationLastAttemptAt > :afterAt
      OR (c.providerCreationLastAttemptAt = :afterAt AND c.id > :afterId))`,
    { afterAt: after.lastAttemptAt, afterId: after.id },
  ];
}
