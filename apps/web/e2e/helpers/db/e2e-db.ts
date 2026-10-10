import { Client } from 'pg';

// The product cannot create a booking in the past (the API rejects a past `scheduledAt`), so an
// APPROVED appointment whose end time has already passed — the precondition of UC-074's no-show —
// can only be reached by moving a booking's time in the database. Use this for that and nothing
// else: every other step of a spec goes through the real BFF.
//
// Defaults to the local/CI compose database and its migrator role (`docker/docker-compose.yml`,
// `pr-tests.yml`); PLAYWRIGHT_DB_URL overrides it.
const DB_URL =
  process.env.PLAYWRIGHT_DB_URL ?? 'postgres://ikaro_migrator:ikaro_migrator@localhost:5432/ikaro';

// The seeded `lavacar-beloauto` tenant every E2E booking belongs to. A booking's identity is
// `(tenant_id, id)`, so every statement below filters on both.
const E2E_TENANT_ID = '00000000-0000-7000-8000-000000000001';

async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function shiftBooking(bookingId: string, hoursFromNow: number): Promise<void> {
  await withClient(async (client) => {
    const result = await client.query(
      `UPDATE booking.bookings
          SET scheduled_at = now() + make_interval(hours => $3::int)
        WHERE tenant_id = $1 AND id = $2`,
      [E2E_TENANT_ID, bookingId, hoursFromNow],
    );
    if (result.rowCount !== 1) {
      throw new Error(`shiftBooking: expected to update 1 booking, updated ${result.rowCount}`);
    }
  });
}

// Moves a booking `hoursAgo` hours into the past, so `scheduledAt + totalDurationMins` has passed
// for any realistic service duration.
export function backdateBooking(bookingId: string, hoursAgo = 6): Promise<void> {
  return shiftBooking(bookingId, -hoursAgo);
}

// The reverse: puts an already-ended booking back in the future. A spec opens the booking while it
// has ended, then calls this, to reproduce the stale screen whose no-show the backend refuses with
// 422 BOOKING_NOT_YET_ENDED.
export function postponeBooking(bookingId: string, hoursAhead = 48): Promise<void> {
  return shiftBooking(bookingId, hoursAhead);
}
