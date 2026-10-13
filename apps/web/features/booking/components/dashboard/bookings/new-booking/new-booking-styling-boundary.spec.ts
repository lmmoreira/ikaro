import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Negative guarantee (M23-S40): the staff shell has its own design system and takes no tenant
// branding, so no dashboard file of the "Novo agendamento" flow may read a business `--ba-*`
// variable (.copilot/context.md § Web styling boundary). It holds by construction — nothing else
// would notice a regression.
const BOOKINGS_DIR = join(__dirname, '..');
const NEW_BOOKING_DIR = __dirname;

const NEW_BOOKING_FILES_IN_BOOKINGS_DIR = [
  'CustomerChooserStep',
  'CustomerSearchPanel',
  'GuestContactForm',
  'NewBookingChooserPage',
  'NewBookingForStaffPage',
  'NewBookingOutcome',
  'NewBookingSummaryCard',
  'NewMenu',
];

function sourceFiles(dir: string, names?: readonly string[]): string[] {
  return readdirSync(dir)
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.spec\.(ts|tsx)$/.test(file))
    .filter((file) => !names || names.some((name) => file.startsWith(`${name}.`)))
    .map((file) => join(dir, file));
}

describe('the staff new-booking flow and the styling boundary', () => {
  const files = [
    ...sourceFiles(NEW_BOOKING_DIR),
    ...sourceFiles(BOOKINGS_DIR, NEW_BOOKING_FILES_IN_BOOKINGS_DIR),
  ];

  it('covers every file of the flow', () => {
    expect(files.length).toBeGreaterThanOrEqual(18);
  });

  it.each(files.map((file) => [file.slice(file.indexOf('features/')), file]))(
    '%s reads no --ba-* variable',
    (_name, file) => {
      expect(readFileSync(file as string, 'utf8')).not.toContain('--ba-');
    },
  );
});
