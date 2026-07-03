export function resolveReturnTo(returnTo: string | undefined): string | null {
  if (typeof returnTo !== 'string') return null;
  return returnTo.startsWith('/dashboard/') ? returnTo : null;
}

export function appendReturnTo(path: string, returnTo: string | null | undefined): string {
  if (!returnTo) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}
