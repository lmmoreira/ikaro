export function hashSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function parseDayOffset(daysAhead: number, seed: string): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  const slotIndex = hashSeed(seed) % 12;
  date.setHours(8 + Math.floor(slotIndex / 2), (slotIndex % 2) * 30, 0, 0);
  return date.toISOString();
}
