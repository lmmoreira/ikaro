export function buildTimeOptions(stepMinutes: number): readonly string[] {
  const totalMinutes = 24 * 60;
  const step = Math.max(1, stepMinutes);
  const options: string[] = [];

  for (let minutes = 0; minutes < totalMinutes; minutes += step) {
    const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mins = String(minutes % 60).padStart(2, '0');
    options.push(`${hours}:${mins}`);
  }

  return options;
}
