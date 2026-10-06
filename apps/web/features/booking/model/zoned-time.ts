const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// The offset (in minutes, east of UTC positive) the zone has at `instant`.
function zoneOffsetMinutes(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60_000);
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// Converts a wall-clock "YYYY-MM-DDTHH:mm" (what an <input type="datetime-local"> holds) read in
// `timeZone` — the TENANT's timezone, never the browser's — into an ISO string with that zone's
// offset, which is what POST /availability-alerts expects. Two passes settle a wall time near a
// DST change. Returns null for a malformed value.
export function wallTimeToOffsetIso(wall: string, timeZone: string): string | null {
  const match = WALL_TIME.exec(wall);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);

  let offset = zoneOffsetMinutes(asIfUtc, timeZone);
  const settled = zoneOffsetMinutes(asIfUtc - offset * 60_000, timeZone);
  if (settled !== offset) offset = settled;

  const instant = asIfUtc - offset * 60_000;
  const localWall = new Date(instant + offset * 60_000).toISOString().slice(0, 19);
  return `${localWall}${formatOffset(offset)}`;
}
