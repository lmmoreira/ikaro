export function formatMoney(amount: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency })
    .format(amount)
    .replace(' ', ' '); // normalize non-breaking space to regular space
}
