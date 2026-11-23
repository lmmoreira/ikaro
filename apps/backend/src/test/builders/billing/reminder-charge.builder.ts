import type { ChargeKind } from '../../../contexts/billing/domain/charge.types';
import type { ReminderCharge } from '../../../contexts/billing/domain/reminder-schedule';
import { addDaysUTC, todayUTC } from '../../../shared/utils/calendar-date';

/** What `ReminderSchedule` reads of an open charge: a `PERIOD` charge due in three days. */
export class ReminderChargeBuilder {
  private id = 'charge-1';
  private kind: ChargeKind = 'PERIOD';
  private status: ReminderCharge['status'] = 'PENDING';
  private dueDate = addDaysUTC(todayUTC(), 3);

  withId(id: string): this {
    this.id = id;
    return this;
  }

  asRecovery(): this {
    this.kind = 'RECOVERY';
    return this;
  }

  withStatus(status: ReminderCharge['status']): this {
    this.status = status;
    return this;
  }

  withDueDate(dueDate: string): this {
    this.dueDate = dueDate;
    return this;
  }

  build(): ReminderCharge {
    return { id: this.id, kind: this.kind, status: this.status, dueDate: this.dueDate };
  }
}
