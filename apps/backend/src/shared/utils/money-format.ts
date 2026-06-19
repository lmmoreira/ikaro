export function formatMoney(
  amount: string | number,
  locale: string,
  currency: string,
  decimalPlaces = 2,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimalPlaces,
  }).format(Number(amount));
}

/** @deprecated Use formatMoney(amount, locale, currency) instead. Removed in TD02-S07. */
export function formatBRL(amount: string): string {
  return formatMoney(amount, 'pt-BR', 'BRL');
}
