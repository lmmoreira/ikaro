import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The `event-handler-suspension-declaration` detector forces every `subscribe()` to state
// `skipWhenSuspended` explicitly, but not the *right* value: a notification send handler wrongly
// declared `false` passes CI and would email a suspended tenant's customers. This spec pins the
// declared value of the handlers where the wrong one is harmful (UC-121, UC-123, UC-125).
const CONTEXTS_DIR = join(__dirname, '../../../contexts');

function handlerFiles(context: string): string[] {
  const dir = join(CONTEXTS_DIR, context, 'infrastructure/events');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.handler.ts') && !name.endsWith('.spec.ts'))
    .sort();
}

// Every declaration written at a `eventBus.subscribe(` call site of the file, in source order.
function declarations(context: string, file: string): string[] {
  const source = readFileSync(join(CONTEXTS_DIR, context, 'infrastructure/events', file), 'utf8');
  const calls = source.split('eventBus.subscribe').slice(1);
  return calls.map((call) => {
    const match =
      /\{\s*(?:requires:\s*'(\w+)',\s*)?skipWhenSuspended:\s*(true|false)\s*,?\s*\}/.exec(call);
    if (!match) throw new Error(`${file}: a subscribe() call without a skipWhenSuspended literal`);
    return `${match[1] ? `requires ${match[1]}, ` : ''}skipWhenSuspended ${match[2]}`;
  });
}

describe('declared skipWhenSuspended values (UC-123)', () => {
  const mustRunWhileSuspended = new Set([
    'dead-letter.handler.ts', // its envelope may lack a tenantId and it must always run
    'staff-invited.handler.ts', // inviting staff to a suspended tenant is an operator action
    'tenant-provisioned.handler.ts', // template seed
  ]);

  describe('Notification', () => {
    const files = handlerFiles('notification');

    it('finds every Notification handler (guards a silently empty glob)', () => {
      expect(files.length).toBeGreaterThanOrEqual(19);
    });

    it.each(files.filter((file) => !mustRunWhileSuspended.has(file)))(
      '%s is a send handler: skipWhenSuspended true on every subscription',
      (file) => {
        const declared = declarations('notification', file);
        expect(declared.length).toBeGreaterThan(0);
        expect(declared.every((value) => value === 'skipWhenSuspended true')).toBe(true);
      },
    );

    it.each([...mustRunWhileSuspended])(
      '%s must run while a tenant is suspended: skipWhenSuspended false',
      (file) => {
        expect(declarations('notification', file)).toEqual(['skipWhenSuspended false']);
      },
    );

    it('has 21 send subscriptions declared true and 3 declared false (24 sites)', () => {
      const all = files.flatMap((file) => declarations('notification', file));
      expect(all.filter((value) => value === 'skipWhenSuspended true')).toHaveLength(21);
      expect(all.filter((value) => value === 'skipWhenSuspended false')).toHaveLength(3);
    });
  });

  describe('Loyalty', () => {
    it('earns points only for a tenant entitled to LOYALTY and not suspended', () => {
      expect(declarations('loyalty', 'booking-completed.handler.ts')).toEqual([
        'requires LOYALTY, skipWhenSuspended true',
      ]);
    });

    it('keeps the audit log running while suspended', () => {
      expect(declarations('loyalty', 'loyalty-audit-log.handler.ts')).toEqual([
        'skipWhenSuspended false',
      ]);
    });
  });

  describe('Booking', () => {
    it.each([
      'booking-cancelled-availability-alert.handler.ts',
      'booking-rejected-availability-alert.handler.ts',
      'booking-rescheduled-availability-alert.handler.ts',
    ])('%s ends up notifying customers: skipWhenSuspended true', (file) => {
      expect(declarations('booking', file)).toEqual(['skipWhenSuspended true']);
    });

    it.each(['staff-deactivated.handler.ts', 'tenant-provisioned.handler.ts'])(
      '%s is state sync or seeding: skipWhenSuspended false',
      (file) => {
        expect(declarations('booking', file)).toEqual(['skipWhenSuspended false']);
      },
    );

    it('keeps every audit-log subscription running while suspended', () => {
      const declared = declarations('booking', 'booking-audit-log.handler.ts');
      expect(declared).toHaveLength(23);
      expect(declared.every((value) => value === 'skipWhenSuspended false')).toBe(true);
    });
  });

  describe('Staff, Platform and Billing', () => {
    it.each([
      ['staff', 'staff-audit-log.handler.ts', 3],
      ['staff', 'tenant-provisioned.handler.ts', 1],
      ['platform', 'platform-audit-log.handler.ts', 2],
      ['billing', 'billing-audit-log.handler.ts', 2],
      ['billing', 'tenant-provisioned-billing.handler.ts', 1],
    ])('%s/%s runs while suspended (state sync, audit, Billing)', (context, file, sites) => {
      const declared = declarations(context, file);
      expect(declared).toHaveLength(sites);
      expect(declared.every((value) => value === 'skipWhenSuspended false')).toBe(true);
    });
  });
});
