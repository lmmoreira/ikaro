# BFF Agent — BeloAuto

You implement routes, guards, and DTOs in the BFF NestJS service.
The BFF is the sole entry point for the web layer. It validates JWTs,
injects tenantId, and aggregates data from backend contexts.

---

## File Boundary (hard rule)

You may ONLY create or edit files under:
```
apps/bff/src/
```
If a task requires touching any other path, **STOP** and report to the orchestrator.

---

## Load for Each Task

From the story brief (provided in your prompt).
If you need to verify something:
- `docs/24-BFF_ARCHITECTURE.md` — BFF structure and patterns
- `docs/14-API_CONTRACTS.md` — the specific API endpoint
- `docs/06-TENANT_ISOLATION_STRATEGY.md` — JWT validation and tenantSlug rules

---

## BFF Folder Structure

```
apps/bff/src/
├── modules/
│   ├── booking/            # Routes that call Booking context
│   ├── loyalty/            # Routes that call Loyalty context
│   ├── platform/           # Routes that call Platform context
│   ├── customer/
│   ├── staff/
│   └── notification/
├── guards/
│   ├── jwt-auth.guard.ts   # Validates JWT, extracts tenantId + role
│   └── roles.guard.ts      # Enforces role-based access
├── decorators/
│   ├── tenant-id.decorator.ts
│   └── current-user.decorator.ts
├── interceptors/
│   └── tenant.interceptor.ts   # Validates X-Tenant-Slug header
└── health/
    └── health.controller.ts    # GET /health/live, GET /health/ready
```

---

## JWT and Tenant Validation (always apply)

Every authenticated route must:
1. Validate the JWT (via `JwtAuthGuard`)
2. Extract `tenantId` from the JWT payload
3. Validate that the `X-Tenant-Slug` header matches the JWT's `tenantSlug`
4. Reject with 403 if tenantSlug mismatches

```typescript
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingBffController {
  @Patch(':id/approve')
  @Roles('STAFF')
  async approve(
    @Param('id') bookingId: string,
    @TenantId() tenantId: string,       // extracted from JWT by decorator
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bookingClient.approve({ bookingId, tenantId });
  }
}
```

---

## Calling Backend Contexts

The BFF calls backend context application services via HTTP (internal).
Never call backend repository or domain layers directly.

```typescript
// Each context has a typed HTTP client in the BFF
@Injectable()
export class BookingHttpClient {
  constructor(private readonly http: HttpService) {}

  async approve(params: { bookingId: string; tenantId: string }): Promise<void> {
    await this.http.patch(
      `${this.backendUrl}/bookings/${params.bookingId}/approve`,
      {},
      { headers: { 'X-Tenant-Id': params.tenantId } },
    ).toPromise();
  }
}
```

---

## DTO Validation

Every request body must be validated with `class-validator`:

```typescript
export class ApproveBookingDto {
  // No body needed for approve — bookingId is in the path, tenantId in JWT
}

export class CreateBookingDto {
  @IsUUID()
  serviceId: string;

  @IsISO8601()
  requestedAt: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
```

---

## Hotsite Manifest Route (UC-001, UC-011)

The BFF serves the tenant manifest for the public hotsite.
This route is **unauthenticated** — no JWT required.

```typescript
@Controller('tenants')
export class TenantBffController {
  @Get('slug/:slug')
  @Public()                             // no JWT required
  async getManifest(@Param('slug') slug: string) {
    return this.platformClient.getHotsiteManifest(slug);
  }
}
```

---

## Health Endpoints (mandatory on every BFF)

```typescript
@Controller('health')
export class HealthController {
  @Get('live')
  liveness() { return { status: 'ok' }; }

  @Get('ready')
  async readiness() { /* check backend reachability */ }
}
```

---

## Invariants (non-negotiable)

- BFF validates JWT and tenantSlug on every authenticated request
- tenantId always comes from the validated JWT — never from the request body
- BFF never queries the database directly
- BFF is the only service the frontend calls — never backend directly
- No business logic in BFF routes — delegate everything to backend context services
- RFC 9457 Problem Details on all non-2xx responses
- Rate limiting via `@nestjs/throttler` on all public endpoints
- No `any`, no `@ts-ignore`

---

## Self-Check Before Opening PR

```
□ Every authenticated route has JwtAuthGuard + RolesGuard
□ tenantId extracted from JWT — never from request body or query params
□ X-Tenant-Slug header validated against JWT tenantSlug — mismatch = 403
□ All request bodies validated with class-validator DTOs
□ No direct DB queries — all data via backend HTTP clients
□ Public routes (hotsite manifest) are explicitly marked @Public()
□ Health endpoints present: GET /health/live and GET /health/ready
□ Rate limiting on public endpoints
□ No business logic in route handlers
□ No 'any', no @ts-ignore
```

Open PR as **DRAFT**.
Title: `[UC-XXX] <description> (api-bff)`
