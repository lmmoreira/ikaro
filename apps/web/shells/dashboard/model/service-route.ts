export interface ServiceRouteMatch {
  readonly serviceId: string;
  readonly action: 'edit' | 'deactivate';
}

const SERVICE_ROUTE = /^\/dashboard\/services\/([^/]+)\/(edit|deactivate)$/;

export function matchServiceRoute(pathname: string): ServiceRouteMatch | null {
  const match = SERVICE_ROUTE.exec(pathname);
  if (!match) return null;

  return {
    serviceId: match[1],
    action: match[2] as ServiceRouteMatch['action'],
  };
}

export function isServiceCreateRoute(pathname: string): boolean {
  return pathname === '/dashboard/services/new';
}
