import { SimulateProviderEventSchema } from './simulate-provider-event.dto';

const ID = '0197c1d2-3e4f-7a5b-8c6d-9e0f1a2b3c4d';
const OTHER = '0197c1d2-3e4f-7a5b-8c6d-9e0f1a2b3c4e';

describe('SimulateProviderEventSchema', () => {
  it('accepts the tenant form and defaults the delivery to NORMAL', () => {
    expect(SimulateProviderEventSchema.parse({ tenantId: ID, event: 'PAID_PIX' })).toEqual({
      tenantId: ID,
      event: 'PAID_PIX',
      delivery: 'NORMAL',
    });
  });

  it('accepts the charge form with a delivery and a failure', () => {
    const parsed = SimulateProviderEventSchema.parse({
      chargeId: ID,
      event: 'CHARGEBACK_LOST',
      delivery: 'OUT_OF_ORDER',
      failure: 'LINK_EXPIRED',
    });

    expect(parsed).toMatchObject({
      chargeId: ID,
      delivery: 'OUT_OF_ORDER',
      failure: 'LINK_EXPIRED',
    });
  });

  it.each([
    ['neither id', { event: 'PAID_PIX' }],
    ['both ids', { tenantId: ID, chargeId: OTHER, event: 'PAID_PIX' }],
    ['an unknown event', { tenantId: ID, event: 'PAID_CASH' }],
    ['an unknown delivery', { tenantId: ID, event: 'PAID_PIX', delivery: 'LATE' }],
    ['an unknown failure', { tenantId: ID, event: 'PAID_PIX', failure: 'PROVIDER_4XX' }],
    ['a non-uuid id', { tenantId: 'acme', event: 'PAID_PIX' }],
    ['an unknown key', { tenantId: ID, event: 'PAID_PIX', amount: 1 }],
  ])('rejects %s', (_label, body) => {
    expect(SimulateProviderEventSchema.safeParse(body).success).toBe(false);
  });
});
