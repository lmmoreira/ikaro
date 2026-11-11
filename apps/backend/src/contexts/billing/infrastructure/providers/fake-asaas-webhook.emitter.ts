import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import type { IClock } from '../../../../shared/ports/clock.port';
import { ASAAS_DATE_FORMAT, ASAAS_ZONE } from './asaas-event-normalizer';
import { receiptUrlOf, type FakeCharge, type FakeWebhookDelivery } from './fake-billing.types';

export const FAKE_WEBHOOK_TOKEN = 'fake-asaas-access-token';

// The shape and the id format are the ones the sandbox run observed (docs/ASAAS_PROVIDER.md § 2,
// check 11, and § 1 item 8): `evt_<32 hex>&<n>` where the hex part repeats for events of one type
// and `n` increases, and a `dateCreated` in São Paulo local time with no offset.
export class FakeAsaasWebhookEmitter {
  private sequence = 0;

  constructor(
    private readonly clock: IClock,
    private readonly accessToken: string = FAKE_WEBHOOK_TOKEN,
  ) {}

  build(eventName: string, charge: FakeCharge, asaasStatus: string): FakeWebhookDelivery {
    this.sequence += 1;
    const body = {
      id: `evt_${this.hexFor(eventName)}&${this.sequence}`,
      event: eventName,
      dateCreated: DateTime.fromJSDate(this.clock.now(), { zone: ASAAS_ZONE }).toFormat(
        ASAAS_DATE_FORMAT,
      ),
      account: { id: 'fake-account', ownerId: 'fake-owner' },
      payment: this.paymentOf(charge, asaasStatus),
    };
    return {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Asaas_Hmlg/3.0',
        'asaas-access-token': this.accessToken,
      },
      delayMs: 0,
    };
  }

  private hexFor(eventName: string): string {
    return createHash('sha256').update(eventName).digest('hex').slice(0, 32);
  }

  private paymentOf(charge: FakeCharge, asaasStatus: string): Record<string, unknown> {
    return {
      object: 'payment',
      id: charge.id,
      customer: charge.customerId,
      value: charge.amountMinor / 100,
      billingType: charge.paymentMethod ?? 'UNDEFINED',
      status: asaasStatus,
      dueDate: charge.dueDate,
      externalReference: charge.externalReference,
      invoiceUrl: charge.paymentUrl,
      deleted: charge.state === 'CANCELLED',
      paymentDate: charge.paidAt?.toISOString() ?? null,
      transactionReceiptUrl: receiptUrlOf(charge),
    };
  }
}
