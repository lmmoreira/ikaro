import { ChargeBuilder, ChargeLineBuilder } from '../../../../test/builders/billing';
import { InMemoryChargeRepository } from '../../../../test/repositories/billing/in-memory-charge.repository';
import { ListBillingChargesUseCase } from './list-billing-charges.use-case';

describe('ListBillingChargesUseCase', () => {
  let charges: InMemoryChargeRepository;
  let useCase: ListBillingChargesUseCase;
  const tenantId = '0197b0a0-0000-7000-8000-0000000000a1';

  beforeEach(() => {
    charges = new InMemoryChargeRepository();
    useCase = new ListBillingChargesUseCase(charges);
  });

  it('pages the tenant’s charges newest due date first with the Pattern A envelope', async () => {
    for (const dueDate of ['2026-08-10', '2026-09-10', '2026-10-10']) {
      await charges.save(
        new ChargeBuilder()
          .withTenantId(tenantId)
          .withPeriod(dueDate, dueDate)
          .withDueDate(dueDate)
          .build(),
      );
    }

    const first = await useCase.execute({ tenantId, limit: 2, offset: 0 });
    const rest = await useCase.execute({ tenantId, limit: 2, offset: 2 });

    expect(first.items.map((item) => item.dueDate)).toEqual(['2026-10-10', '2026-09-10']);
    expect(first.pagination).toEqual({ limit: 2, offset: 0, total: 3, hasMore: true });
    expect(rest.items.map((item) => item.dueDate)).toEqual(['2026-08-10']);
    expect(rest.pagination).toEqual({ limit: 2, offset: 2, total: 3, hasMore: false });
  });

  it('maps a paid period charge to the documented item, with its lines and no tax', async () => {
    const paidAt = new Date('2026-11-05T12:00:00.000Z');
    const charge = new ChargeBuilder()
      .withTenantId(tenantId)
      .withPeriod('2026-11-10', '2026-12-09')
      .withDueDate('2026-11-10')
      .withLines([
        new ChargeLineBuilder().withFeatureKey('HOTSITE').withUnitPriceMinor(4900).build(),
        new ChargeLineBuilder()
          .withFeatureKey('CHATBOT')
          .withTier('PLUS')
          .withUnitPriceMinor(7900)
          .build(),
      ])
      .withPaid('PIX', paidAt, 'https://receipts.example/r1')
      .build();
    await charges.save(charge);

    const { items } = await useCase.execute({ tenantId, limit: 25, offset: 0 });

    expect(items).toEqual([
      {
        id: charge.id,
        kind: 'PERIOD',
        periodStart: '2026-11-10',
        periodEnd: '2026-12-09',
        dueDate: '2026-11-10',
        subtotalMinor: 12800,
        taxMinor: 0,
        amountMinor: 12800,
        currency: 'BRL',
        status: 'PAID',
        method: 'PIX',
        paidAt: paidAt.toISOString(),
        receiptUrl: 'https://receipts.example/r1',
        lines: [
          { featureKey: 'HOTSITE', tier: 'STANDARD', unitPriceMinor: 4900 },
          { featureKey: 'CHATBOT', tier: 'PLUS', unitPriceMinor: 7900 },
        ],
        taxLines: [],
      },
    ]);
  });

  it('gives a recovery charge no period dates and an unpaid charge no paid fields', async () => {
    await charges.save(new ChargeBuilder().withTenantId(tenantId).asRecovery().build());

    const { items } = await useCase.execute({ tenantId, limit: 25, offset: 0 });

    expect(items[0]).toMatchObject({
      kind: 'RECOVERY',
      periodStart: null,
      periodEnd: null,
      method: null,
      paidAt: null,
      receiptUrl: null,
    });
  });

  it('never returns another tenant’s charges and answers an empty page for a tenant with none', async () => {
    await charges.save(
      new ChargeBuilder().withTenantId('0197b0a0-0000-7000-8000-0000000000b2').build(),
    );

    const result = await useCase.execute({ tenantId, limit: 25, offset: 0 });

    expect(result).toEqual({
      items: [],
      pagination: { limit: 25, offset: 0, total: 0, hasMore: false },
    });
  });
});
