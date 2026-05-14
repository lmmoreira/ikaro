export interface Money {
  amount: number;
  currency: 'BRL';
  formatted: string; // always "R$ 1.234,56"
}
