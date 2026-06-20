export interface Money {
  amount: number;
  currency: string;
  formatted: string; // locale+currency formatted via Intl.NumberFormat
}

export interface MoneyAmount {
  amount: number;
  currency: string;
}
