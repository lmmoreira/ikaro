export interface Pagination {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
  nextOffset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}
