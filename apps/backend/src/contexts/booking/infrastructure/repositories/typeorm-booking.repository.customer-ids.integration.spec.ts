import { DataSource } from 'typeorm';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { createTestDataSource } from '../../../../test/test-datasource';
import { BookingStatus } from '../../domain/booking.aggregate';
import { BookingAttendeeEntity } from '../entities/booking-attendee.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { BookingLineResourceAssignmentEntity } from '../entities/booking-line-resource-assignment.entity';
import { BookingStatusTransitionEntity } from '../entities/booking-status-transition.entity';
import { TypeOrmBookingRepository } from './typeorm-booking.repository';
import { TypeOrmBookingStatusTransitionRepository } from './typeorm-booking-status-transition.repository';

// Own tenants, never shared with another spec: every spec file of a run shares one Postgres
// container (docs/ENGINEERING_RULES_TESTING.md).
const TENANT_A = '00000000-0000-7000-8000-0000000028a1';
const TENANT_B = '00000000-0000-7000-8000-0000000028b1';
const APPROVER = '00000000-0000-7000-8000-0000000028f1';
const CUSTOMERS = [1, 2, 3, 4, 5].map(
  (n) => `00000000-0000-7000-8000-00000028c${String(n).padStart(3, '0')}`,
);
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();

describe('TypeOrmBookingRepository.findCustomerIdsWithApprovedBookingsAfter (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmBookingRepository;
  const after = new Date(NOW);

  const seed = async (
    tenantId: string,
    customerId: string | null,
    options: { status?: BookingStatus; scheduledAt?: Date } = {},
  ): Promise<void> => {
    const status = options.status ?? BookingStatus.APPROVED;
    const builder = new BookingBuilder()
      .withTenantId(tenantId)
      .withCustomerId(customerId)
      .withStatus(status)
      .withScheduledAt(options.scheduledAt ?? new Date(NOW + 3 * DAY_MS))
      .withLines([]);
    if (status === BookingStatus.APPROVED) {
      builder.withApprovedAt(new Date(NOW)).withApprovedBy(APPROVER);
    }
    await repo.save(builder.build());
  };

  // The tenants' ids are fixed and every spec file of a run shares one Postgres container, so rows
  // an earlier aborted spec left behind are cleared before seeding, and again at the end.
  const cleanup = async (): Promise<void> => {
    const tenantIds = [TENANT_A, TENANT_B];
    await dataSource.query(
      `DELETE FROM booking.booking_status_transitions WHERE tenant_id = ANY($1)`,
      [tenantIds],
    );
    await dataSource.query(`DELETE FROM booking.bookings WHERE tenant_id = ANY($1)`, [tenantIds]);
  };

  const wholeRead = async (tenantId: string, limit: number): Promise<string[]> => {
    const collected: string[] = [];
    let cursor: string | null = null;
    let page: string[];
    do {
      page = await repo.findCustomerIdsWithApprovedBookingsAfter(tenantId, after, cursor, limit);
      collected.push(...page);
      cursor = page.length > 0 ? page[page.length - 1] : cursor;
    } while (page.length === limit);
    return collected;
  };

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    await cleanup();
    repo = new TypeOrmBookingRepository(
      dataSource.getRepository(BookingEntity),
      dataSource.getRepository(BookingLineEntity),
      dataSource.getRepository(BookingAttendeeEntity),
      dataSource.getRepository(BookingLineResourceAssignmentEntity),
      new InMemoryTenantSettingsPort(),
      new InMemoryEventBus(),
      new TypeOrmBookingStatusTransitionRepository(
        dataSource.getRepository(BookingStatusTransitionEntity),
      ),
    );

    await seed(TENANT_A, CUSTOMERS[0]);
    await seed(TENANT_A, CUSTOMERS[0], { scheduledAt: new Date(NOW + 5 * DAY_MS) });
    await seed(TENANT_A, CUSTOMERS[1]);
    await seed(TENANT_A, CUSTOMERS[2]);
    await seed(TENANT_A, CUSTOMERS[3]);
    await seed(TENANT_A, CUSTOMERS[4]);
    // Not notified: a guest, other statuses, a booking already behind us.
    await seed(TENANT_A, null);
    await seed(TENANT_A, '00000000-0000-7000-8000-00000028d001', {
      status: BookingStatus.PENDING,
    });
    await seed(TENANT_A, '00000000-0000-7000-8000-00000028d002', {
      status: BookingStatus.CANCELLED,
    });
    await seed(TENANT_A, '00000000-0000-7000-8000-00000028d003', {
      scheduledAt: new Date(NOW - DAY_MS),
    });
    // Another tenant: never returned for TENANT_A.
    await seed(TENANT_B, '00000000-0000-7000-8000-00000028e001');
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await dataSource.destroy();
    }
  });

  it('returns each customer once, ordered by id, however many bookings they hold', async () => {
    const ids = await repo.findCustomerIdsWithApprovedBookingsAfter(TENANT_A, after, null, 100);

    expect(ids).toEqual(CUSTOMERS);
  });

  it('excludes guests, other statuses and bookings that started before the cut-off', async () => {
    const ids = await repo.findCustomerIdsWithApprovedBookingsAfter(TENANT_A, after, null, 100);

    expect(ids).not.toContain('00000000-0000-7000-8000-00000028d001');
    expect(ids).not.toContain('00000000-0000-7000-8000-00000028d002');
    expect(ids).not.toContain('00000000-0000-7000-8000-00000028d003');
    expect(ids).toHaveLength(CUSTOMERS.length);
  });

  it('never returns another tenant customer', async () => {
    const ids = await repo.findCustomerIdsWithApprovedBookingsAfter(TENANT_A, after, null, 100);
    const otherTenantIds = await repo.findCustomerIdsWithApprovedBookingsAfter(
      TENANT_B,
      after,
      null,
      100,
    );

    expect(ids).not.toContain('00000000-0000-7000-8000-00000028e001');
    expect(otherTenantIds).toEqual(['00000000-0000-7000-8000-00000028e001']);
  });

  it('pages by key and returns every customer exactly once across pages', async () => {
    const collected = await wholeRead(TENANT_A, 2);

    expect(collected).toEqual(CUSTOMERS);
  });

  it('returns an empty page after the last customer', async () => {
    const ids = await repo.findCustomerIdsWithApprovedBookingsAfter(
      TENANT_A,
      after,
      CUSTOMERS[CUSTOMERS.length - 1],
      2,
    );

    expect(ids).toEqual([]);
  });

  it('returns nothing for a tenant with no qualifying booking', async () => {
    const ids = await repo.findCustomerIdsWithApprovedBookingsAfter(
      '00000000-0000-7000-8000-0000000028a9',
      after,
      null,
      100,
    );

    expect(ids).toEqual([]);
  });
});
