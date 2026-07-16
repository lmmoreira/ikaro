import { JwtIssuerService } from './jwt-issuer.service';
import { TenantInfoResponse } from '../../shared/types/backend-responses';

interface StaffActor {
  staffId: string;
  role: 'STAFF' | 'MANAGER';
}

export function issueStaffToken(
  jwtIssuer: JwtIssuerService,
  staff: StaffActor,
  tenant: TenantInfoResponse,
  userName: string | null,
): string {
  return jwtIssuer.issueToken({
    sub: staff.staffId,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    userName,
    role: staff.role,
    locale: tenant.locale,
  });
}

export function issueCustomerToken(
  jwtIssuer: JwtIssuerService,
  customerId: string,
  tenant: TenantInfoResponse,
  userName: string | null,
): string {
  return jwtIssuer.issueToken({
    sub: customerId,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    userName,
    role: 'CUSTOMER',
    locale: tenant.locale,
  });
}
