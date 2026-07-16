export function isValidEmail(address: string): boolean {
  const atIdx = address.indexOf('@');
  if (atIdx <= 0) return false;
  const domain = address.slice(atIdx + 1);
  const dotIdx = domain.lastIndexOf('.');
  return domain.length > 0 && dotIdx > 0 && dotIdx < domain.length - 1;
}
