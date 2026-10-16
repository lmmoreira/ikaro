import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Negative guarantee (M23-S19): the recurring-reservation form is shared by the customer's account
// shell and the staff dashboard, and both are unbranded Tailwind/shadcn. Neither may read a
// business `--ba-*` variable (the hotsite's tenant branding), so no shared file and no staff-shell
// file of the flow does (.copilot/context.md § Web styling boundary). It holds by construction —
// nothing else would notice a regression.
const SHARED_DIR = __dirname;
const BOOKINGS_DIR = join(__dirname, '..', 'dashboard', 'bookings');

const STAFF_FILES_IN_BOOKINGS_DIR = [
  'NewRecurringScheduleForStaff',
  'NewRecurringScheduleForStaffNoServices',
  'NewRecurringScheduleForStaffResult',
];

function sourceFiles(dir: string, names?: readonly string[]): string[] {
  return readdirSync(dir)
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.spec\.(ts|tsx)$/.test(file))
    .filter((file) => !names || names.some((name) => file === `${name}.tsx`))
    .map((file) => join(dir, file));
}

describe('the recurring-reservation form and the styling boundary', () => {
  const files = [
    ...sourceFiles(SHARED_DIR),
    ...sourceFiles(BOOKINGS_DIR, STAFF_FILES_IN_BOOKINGS_DIR),
  ];

  it('covers every file of the shared form and the staff shell', () => {
    // The shared directory holds the fields card, its parts and the recap; the staff shell is three.
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(files.filter((file) => file.includes('ForStaff'))).toHaveLength(3);
  });

  it.each(files.map((file) => [file.slice(file.indexOf('features/')), file]))(
    '%s reads no business --ba-* variable',
    (_name, file) => {
      expect(readFileSync(file, 'utf-8')).not.toMatch(/--ba-/);
    },
  );
});
