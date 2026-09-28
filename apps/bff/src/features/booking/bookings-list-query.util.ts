export interface BookingListQuery {
  status: string;
  page: number;
  limit: number;
  date?: string;
  from?: string;
  to?: string;
}

export function buildBookingListParams(query: BookingListQuery): Record<string, unknown> {
  const params: Record<string, unknown> = {
    status: query.status,
    limit: query.limit,
    offset: (query.page - 1) * query.limit,
  };

  // Date keys are forwarded as-is: the backend interprets them as tenant-local calendar days
  // (it owns the tenant's timezone), so the BFF must never attach a UTC time-of-day to them.
  if (query.date) {
    params.from = query.date;
    params.to = query.date;
  } else if (query.from) {
    params.from = query.from;
    if (query.to) params.to = query.to;
  }

  return params;
}

export function isStaffOrManagerRole(role: string): boolean {
  return role === 'MANAGER' || role === 'STAFF';
}
