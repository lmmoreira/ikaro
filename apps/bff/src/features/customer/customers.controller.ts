import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Query } from '@nestjs/common';
import {
  BffErrorCode,
  CustomerProfileResponse,
  CustomerSearchListResponse,
  TenantOption,
} from '@ikaro/types';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { CustomerTenantSummaryResponse } from '../auth/auth.types';
import { TenantInfoResponse } from '../../shared/types/backend-responses';
import { toTenantOption } from './customers.mapper';
import {
  CustomerSearchResponse,
  LoyaltyBalanceByTenantItem,
  LoyaltyBalanceItem,
} from './customers.types';
import { throwProblemDetail } from '../../shared/http/problem-detail';
import {
  CustomerSearchQuery,
  CustomerSearchQuerySchema,
  UpdateCustomerProfileBody,
  UpdateCustomerProfileBodySchema,
} from './customers.schemas';

// Request Zod schemas moved to customers.schemas.ts (TD37-S10) — re-exported here so existing
// imports of these symbols from this file (e.g. address-schema-code-reuse.spec.ts) keep
// working unchanged.
export * from './customers.schemas';

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
    if (items.length === 0) return { items: [], total };

    const balances = await this.backendHttp.get<LoyaltyBalanceItem[]>('/loyalty/balances', {
      customerIds: items.map((c) => c.customerId).join(','),
    });
    const pointsByCustomer = new Map(balances.map((b) => [b.customerId, b.currentPoints]));
    const enriched = items.map((customer) => ({
      ...customer,
      currentPoints: pointsByCustomer.get(customer.customerId) ?? 0,
    }));

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
    const [tenantInfos, balances] = await Promise.all([
      this.backendHttp.get<TenantInfoResponse[]>(`/internal/tenants?ids=${tenantIds.join(',')}`),
      this.backendHttp.get<LoyaltyBalanceByTenantItem[]>('/loyalty/balances/own'),
    ]);
    const tenantMap = new Map(tenantInfos.map((t) => [t.id, t]));
    const pointsByTenant = new Map(balances.map((b) => [b.tenantId, b.currentPoints]));

    return tenants.map((t) => {
      const tenantInfo = tenantMap.get(t.tenantId);
      if (!tenantInfo) {
        throw throwProblemDetail(
          HttpStatus.INTERNAL_SERVER_ERROR,
          BffErrorCode.TENANT_LOOKUP_INCONSISTENT,
          `Tenant ${t.tenantId} missing from batch response`,
        );
      }
      return toTenantOption(t, tenantInfo, { currentPoints: pointsByTenant.get(t.tenantId) ?? 0 });
    });
  }

  @Get(':customerId')
  @Roles('STAFF', 'MANAGER')
  getCustomer(
    @Param('customerId', CanonicalParseUUIDPipe) customerId: string,
  ): Promise<CustomerProfileResponse> {
    return this.backendHttp.get<CustomerProfileResponse>(`/customers/${customerId}`);
  }
}
