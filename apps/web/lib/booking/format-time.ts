const TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

export function formatTimeBR(iso: string): string {
  return TIME_FORMATTER.format(new Date(iso));
}

export function formatDateBR(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

export function formatDateLongBR(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const formatted = LONG_DATE_FORMATTER.format(Date.UTC(year, month - 1, day));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
