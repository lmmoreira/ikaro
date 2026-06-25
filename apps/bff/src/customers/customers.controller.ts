import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Query } from '@nestjs/common';
import { z } from 'zod';
import { CustomerProfileResponse, CustomerSearchListResponse, TenantOption } from '@ikaro/types';
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';
import { Roles } from '../shared/decorators/roles.decorator';
import { BackendHttpService } from '../shared/http/backend-http.service';
import { LoyaltyBalanceResponse } from '../loyalty/loyalty.types';
import { CustomerSearchResponse } from './customers.types';
import { CurrentUser, CurrentUserPayload } from '../shared/decorators/current-user.decorator';
import { CustomerTenantSummaryResponse } from '../auth/auth.types';
import { TenantInfoResponse } from '../shared/types/backend-responses';

const AddressSchema = z.object({
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().nullable().optional(),
  neighborhood: z.string().min(1).optional(),
  city: z.string().min(1),
  state: z.string().trim().min(1).max(10),
  zipCode: z.string().trim().min(1).max(20),
});

export const UpdateCustomerProfileBodySchema = z.object({
  name: z.string().min(1).optional(),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'phone must be in E.164 format')
    .nullable()
    .optional(),
  defaultAddress: AddressSchema.nullable().optional(),
});

export type UpdateCustomerProfileBody = z.infer<typeof UpdateCustomerProfileBodySchema>;

const CustomerSearchQuerySchema = z.object({
  search: z.string().min(5).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

type CustomerSearchQuery = z.infer<typeof CustomerSearchQuerySchema>;

@Controller('customers')
export class CustomersController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  @Roles('STAFF', 'MANAGER')
  async searchCustomers(
    @Query(new ZodValidationPipe(CustomerSearchQuerySchema)) query: CustomerSearchQuery,
  ): Promise<CustomerSearchListResponse> {
    const params = new URLSearchParams({ limit: String(query.limit) });
    if (query.search) params.set('search', query.search);
    const { items, total } = await this.backendHttp.get<CustomerSearchResponse>(
      `/customers?${params}`,
    );
    const enriched = await Promise.all(
      items.map(async (c) => {
        const balance = await this.backendHttp.get<LoyaltyBalanceResponse>(
          `/customers/${c.customerId}/loyalty/balance`,
        );
        return { ...c, currentPoints: balance.currentPoints };
      }),
    );
    return { items: enriched, total };
  }

  @Get('me')
  @Roles('CUSTOMER')
  getProfile(): Promise<CustomerProfileResponse> {
    return this.backendHttp.get<CustomerProfileResponse>('/customers/me');
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @Roles('CUSTOMER')
  updateProfile(
    @Body(new ZodValidationPipe(UpdateCustomerProfileBodySchema)) body: UpdateCustomerProfileBody,
  ): Promise<CustomerProfileResponse> {
    return this.backendHttp.patch<CustomerProfileResponse>('/customers/me', body);
  }

  // Includes the current tenant (not just the others) — the switch-tenant screen needs its
  // name/slug/loyaltyPoints too, to render the non-clickable "Atual" card. The client can
  // never read this from the httpOnly JWT cookie directly, so the BFF returns it here instead
  // of forcing a second round trip.
  @Get('tenants')
  @Roles('CUSTOMER')
  async getTenants(@CurrentUser() user: CurrentUserPayload): Promise<TenantOption[]> {
    const tenants = await this.backendHttp.get<CustomerTenantSummaryResponse[]>(
      `/internal/customers/${user.sub}/tenants`,
      { tenantId: user.tenantId },
    );

    return Promise.all(
      tenants.map(async (t) => {
        const [tenantInfo, balance] = await Promise.all([
          this.backendHttp.get<TenantInfoResponse>(`/internal/tenants/${t.tenantId}`),
          this.backendHttp.get<{ currentPoints: number }>(
            `/internal/customers/${t.customerId}/loyalty/balance`,
            { tenantId: t.tenantId },
          ),
        ]);
        return {
          id: t.tenantId,
          name: tenantInfo.name,
          slug: tenantInfo.slug,
          loyaltyPoints: balance.currentPoints,
        };
      }),
    );
  }
}
