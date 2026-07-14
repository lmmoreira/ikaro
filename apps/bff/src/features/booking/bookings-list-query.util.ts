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

  if (query.date) {
    params.from = `${query.date}T00:00:00.000Z`;
    params.to = `${query.date}T23:59:59.999Z`;
  } else if (query.from) {
    params.from = `${query.from}T00:00:00.000Z`;
    if (query.to) params.to = `${query.to}T23:59:59.999Z`;
  }

  return params;
}

export function isStaffOrManagerRole(role: string): boolean {
  return role === 'MANAGER' || role === 'STAFF';
}
