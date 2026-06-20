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
    maximumFractionDigits: decimalPlaces,
  }).format(Number(amount));
}
