import {
  OPERATOR_CHARGE_SUMMARY_SQL,
  queryOperatorChargeSummaries,
  summarizeOperatorRows,
  type SqlRunner,
} from './typeorm-charge.operator-summary';

type Row = Parameters<typeof summarizeOperatorRows>[0][number];

const TENANT_A = '10000000-0000-4000-8000-0000000000a1';
const TENANT_B = '10000000-0000-4000-8000-0000000000b2';

const row = (overrides: Partial<Row> = {}): Row => ({
  role: 'LAST',
  tenant_id: TENANT_A,
  id: '20000000-0000-4000-8000-000000000001',
  kind: 'PERIOD',
  status: 'PENDING',
  amount_minor: '4900',
  currency: 'BRL',
  due_date: '2026-12-01',
  ...overrides,
});

class RecordingSqlRunner implements SqlRunner {
  readonly calls: { sql: string; parameters: unknown[] | undefined }[] = [];

  constructor(private readonly rows: readonly Row[] = []) {}

  query(sql: string, parameters?: unknown[]): Promise<unknown> {
    this.calls.push({ sql, parameters });
    return Promise.resolve(this.rows);
  }
}

describe('summarizeOperatorRows', () => {
  it('is empty for no rows', () => {
    expect(summarizeOperatorRows([])).toEqual([]);
  });

  it('merges the three roles of one tenant into one summary', () => {
    const summaries = summarizeOperatorRows([
      row({ role: 'LAST', id: 'last-1', due_date: '2026-12-01' }),
      row({ role: 'OVERDUE', id: 'overdue-1', due_date: '2026-10-01', status: 'OVERDUE' }),
      row({
        role: 'RECOVERY',
        id: 'recovery-1',
        kind: 'RECOVERY',
        due_date: '2026-11-20',
        amount_minor: '7400',
      }),
    ]);

    expect(summaries).toEqual([
      {
        tenantId: TENANT_A,
        lastCharge: {
          id: 'last-1',
          kind: 'PERIOD',
          status: 'PENDING',
          amountMinor: 4900,
          currency: 'BRL',
          dueDate: '2026-12-01',
        },
        oldestOverdueDueDate: '2026-10-01',
        openRecovery: {
          id: 'recovery-1',
          kind: 'RECOVERY',
          status: 'PENDING',
          amountMinor: 7400,
          currency: 'BRL',
          dueDate: '2026-11-20',
        },
      },
    ]);
  });

  it('keeps the other facts null when a tenant has only its latest charge', () => {
    const [summary] = summarizeOperatorRows([row()]);

    expect(summary?.lastCharge?.id).toBe('20000000-0000-4000-8000-000000000001');
    expect(summary?.oldestOverdueDueDate).toBeNull();
    expect(summary?.openRecovery).toBeNull();
  });

  it('records only the due date for the overdue role, never a charge fact', () => {
    const [summary] = summarizeOperatorRows([
      row({ role: 'OVERDUE', status: 'OVERDUE', due_date: '2026-09-15' }),
    ]);

    expect(summary).toEqual({
      tenantId: TENANT_A,
      lastCharge: null,
      oldestOverdueDueDate: '2026-09-15',
      openRecovery: null,
    });
  });

  it('keeps tenants apart, in the order their rows first appear', () => {
    const summaries = summarizeOperatorRows([
      row({ tenant_id: TENANT_B, id: 'b-last' }),
      row({ tenant_id: TENANT_A, id: 'a-last' }),
      row({ tenant_id: TENANT_B, role: 'OVERDUE', due_date: '2026-08-01' }),
    ]);

    expect(summaries.map((s) => s.tenantId)).toEqual([TENANT_B, TENANT_A]);
    expect(summaries[0]).toMatchObject({
      lastCharge: { id: 'b-last' },
      oldestOverdueDueDate: '2026-08-01',
    });
    expect(summaries[1]).toMatchObject({
      lastCharge: { id: 'a-last' },
      oldestOverdueDueDate: null,
    });
  });

  it('turns the BIGINT amount string into a number, as Postgres returns it', () => {
    const [summary] = summarizeOperatorRows([row({ amount_minor: '1234567' })]);

    expect(summary?.lastCharge?.amountMinor).toBe(1234567);
    expect(typeof summary?.lastCharge?.amountMinor).toBe('number');
  });
});

describe('queryOperatorChargeSummaries', () => {
  it('answers an empty page without touching the database', async () => {
    const runner = new RecordingSqlRunner([row()]);

    await expect(queryOperatorChargeSummaries(runner, [])).resolves.toEqual([]);
    expect(runner.calls).toHaveLength(0);
  });

  it('runs the one statement with the page ids as its single array parameter', async () => {
    const runner = new RecordingSqlRunner([row()]);

    const summaries = await queryOperatorChargeSummaries(runner, [TENANT_A, TENANT_B]);

    expect(runner.calls).toEqual([
      { sql: OPERATOR_CHARGE_SUMMARY_SQL, parameters: [[TENANT_A, TENANT_B]] },
    ]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.tenantId).toBe(TENANT_A);
  });

  it('scopes every branch of the statement to the page ids', () => {
    const scoped = OPERATOR_CHARGE_SUMMARY_SQL.match(/tenant_id = ANY\(\$1::uuid\[\]\)/g);

    expect(scoped).toHaveLength(3);
  });
});
