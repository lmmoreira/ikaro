import type {
  OperatorChargeFact,
  OperatorChargeSummary,
} from '../../application/ports/charge-repository.port';
import type { ChargeKind, ChargeStatus } from '../../domain/charge.types';

// The operator list's three facts for one page of tenants (UC-111, M26-S14) in ONE statement: the
// latest non-cancelled charge, the oldest overdue one and the open recovery one, each a
// `DISTINCT ON (tenant_id)` over `tenant_id = ANY($1)`. `$1` is the page's own tenant ids, so no
// other tenant can appear. All three read `IDX_billing_charges_history (tenant_id, due_date DESC)`.
// `due_date` is cast to text so the driver's `date` handling never shifts the day.
const COLUMNS = `c.tenant_id, c.id, c.kind, c.status, c.amount_minor, c.currency, c.due_date::text AS due_date`;

export const OPERATOR_CHARGE_SUMMARY_SQL = `
  (SELECT DISTINCT ON (c.tenant_id) 'LAST' AS role, ${COLUMNS}
     FROM "billing"."charges" c
     WHERE c.tenant_id = ANY($1::uuid[]) AND c.status <> 'CANCELED'
     ORDER BY c.tenant_id, c.due_date DESC, c.id DESC)
  UNION ALL
  (SELECT DISTINCT ON (c.tenant_id) 'OVERDUE' AS role, ${COLUMNS}
     FROM "billing"."charges" c
     WHERE c.tenant_id = ANY($1::uuid[]) AND c.status = 'OVERDUE'
     ORDER BY c.tenant_id, c.due_date ASC, c.id ASC)
  UNION ALL
  (SELECT DISTINCT ON (c.tenant_id) 'RECOVERY' AS role, ${COLUMNS}
     FROM "billing"."charges" c
     WHERE c.tenant_id = ANY($1::uuid[]) AND c.kind = 'RECOVERY' AND c.status IN ('PENDING', 'OVERDUE')
     ORDER BY c.tenant_id, c.due_date DESC, c.id DESC)
`;

interface SummaryRow {
  role: 'LAST' | 'OVERDUE' | 'RECOVERY';
  tenant_id: string;
  id: string;
  kind: string;
  status: string;
  // BIGINT comes back as a string; the amounts are safe integers (M25-D4).
  amount_minor: string;
  currency: string;
  due_date: string;
}

const toFact = (row: SummaryRow): OperatorChargeFact => ({
  id: row.id,
  kind: row.kind as ChargeKind,
  status: row.status as ChargeStatus,
  amountMinor: Number(row.amount_minor),
  currency: row.currency,
  dueDate: row.due_date,
});

export function summarizeOperatorRows(rows: readonly SummaryRow[]): OperatorChargeSummary[] {
  const byTenant = new Map<string, OperatorChargeSummary>();
  for (const row of rows) {
    const summary = byTenant.get(row.tenant_id) ?? {
      tenantId: row.tenant_id,
      lastCharge: null,
      oldestOverdueDueDate: null,
      openRecovery: null,
    };
    if (row.role === 'LAST') summary.lastCharge = toFact(row);
    else if (row.role === 'OVERDUE') summary.oldestOverdueDueDate = row.due_date;
    else summary.openRecovery = toFact(row);
    byTenant.set(row.tenant_id, summary);
  }
  return [...byTenant.values()];
}

/** The one thing the query needs from the caller's connection: TypeORM's `EntityManager` satisfies it. */
export interface SqlRunner {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

export async function queryOperatorChargeSummaries(
  manager: SqlRunner,
  tenantIds: readonly string[],
): Promise<OperatorChargeSummary[]> {
  if (tenantIds.length === 0) return [];
  const rows = (await manager.query(OPERATOR_CHARGE_SUMMARY_SQL, [tenantIds])) as SummaryRow[];
  return summarizeOperatorRows(rows);
}
