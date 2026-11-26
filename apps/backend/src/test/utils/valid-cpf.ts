/**
 * A fresh CPF with valid check digits, digits only. A reservation holds its tax id until the row is
 * deleted, so a spec that shares a fixed one with an overlapping run (TESTCONTAINERS_REUSE_ENABLE
 * reuses one Postgres) would look like trial farming.
 */
export function newValidCpf(): string {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const check = (base: number[]): number => {
    const sum = base.reduce((acc, digit, i) => acc + digit * (base.length + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const first = check(digits);
  const second = check([...digits, first]);
  return [...digits, first, second].join('');
}
