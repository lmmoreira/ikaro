export function formatMoney(amount: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency })
    .format(amount)
    .replace(/[  ]/g, ' '); // normalize NBSP variants to regular space
}

export function formatCurrencySymbol(locale: string, currency: string): string {
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).formatToParts(0);

  const symbol = parts
    .filter((part) => part.type === 'currency')
    .map((part) => part.value)
    .join('')
    .trim();

  return symbol || currency;
}
