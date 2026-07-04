import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CustomerProfileResponse, CustomerSearchListResponse, TenantOption } from '@ikaro/types';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { CustomerTenantSummaryResponse } from '../auth/auth.types';
import { TenantInfoResponse } from '../../shared/types/backend-responses';
import { toTenantOption } from './customers.mapper';
import { LoyaltyBalanceResponse } from '../loyalty/loyalty.types';
import { CustomerSearchResponse } from './customers.types';

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
  search: z.string().trim().min(1).optional(),
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
      items.map(async (customer) => {
        const balance = await this.backendHttp.get<LoyaltyBalanceResponse>(
          `/customers/${customer.customerId}/loyalty/balance`,
        );
        return { ...customer, currentPoints: balance.currentPoints };
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
  async getTenants(): Promise<TenantOption[]> {
    const tenants =
      await this.backendHttp.get<CustomerTenantSummaryResponse[]>('/customers/me/tenants');
    if (tenants.length === 0) return [];

    const tenantIds = tenants.map((t) => t.tenantId);
    const [tenantInfos, ...balances] = await Promise.all([
      this.backendHttp.get<TenantInfoResponse[]>(`/internal/tenants?ids=${tenantIds.join(',')}`),
      ...tenants.map((t) =>
        this.backendHttp.get<{ currentPoints: number }>(
          `/customers/${t.customerId}/loyalty/balance`,
          { tenantId: t.tenantId },
        ),
      ),
    ]);
    const tenantMap = new Map(tenantInfos.map((t) => [t.id, t]));

    return tenants.map((t, i) => {
      const tenantInfo = tenantMap.get(t.tenantId);
      if (!tenantInfo) throw new Error(`Tenant ${t.tenantId} missing from batch response`);
      return toTenantOption(t, tenantInfo, balances[i]);
    });
  }

  @Get(':customerId')
  @Roles('STAFF', 'MANAGER')
  getCustomer(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<CustomerProfileResponse> {
    return this.backendHttp.get<CustomerProfileResponse>(`/customers/${customerId}`);
  }
}
