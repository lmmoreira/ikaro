export function formatBRL(amount: string): string {
  return Number(amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
