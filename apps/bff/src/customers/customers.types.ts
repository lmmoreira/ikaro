export interface CustomerSearchResponse {
  items: { customerId: string; name: string; email: string }[];
  total: number;
}
