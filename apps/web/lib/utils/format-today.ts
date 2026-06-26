export function formatTodayLabel(locale: string, prefix: string): string {
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  return `${prefix} ${date}`;
}
