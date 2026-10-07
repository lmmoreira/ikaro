// Conversions between a calendar day string ("YYYY-MM-DD") and the Date objects react-day-picker
// (the shadcn <Calendar>) works with. Two directions, two different requirements — get them
// mixed up and the selected day shifts by one whenever the runtime's offset differs from UTC.

// react-day-picker constructs each day cell's Date at LOCAL midnight in the JS runtime's own
// timezone — reading it back out via the SAME local getters (not re-interpreting it through a
// different timezone, e.g. the tenant's business timezone) is what keeps "the calendar day the
// user visually clicked" stable regardless of what timezone the runtime happens to be in.
// Converting through a different timezone here previously shifted the selected day by one
// whenever the runtime's local timezone differed from the tenant's (confirmed via a real CI
// failure, GitHub's UTC runners vs. America/Sao_Paulo: midnight UTC on the 10th became the 9th
// once reinterpreted as Sao Paulo time) — a real correctness bug, not just a test issue.
export function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Parsed as LOCAL time (not UTC) deliberately — fed back into <Calendar selected=…>. react-day-
// picker compares it against the LOCAL-midnight Dates it builds internally for each day cell;
// parsing it as UTC instead corrupts that comparison the moment the runtime's local offset is
// non-zero. Only for the Calendar's `selected`/`month` props — use utcDateFromISO for a label.
export function localDateFromISO(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

// Parsed as UTC deliberately — formatDateLong pins `timeZone: 'UTC'` internally, so it must be
// fed a UTC-midnight Date to round-trip correctly regardless of the runtime's local offset (a
// local-midnight Date displays the wrong day for a runtime with a positive UTC offset). Only for
// labels; using it for the Calendar's `selected` prop would reintroduce the shift above.
export function utcDateFromISO(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}
