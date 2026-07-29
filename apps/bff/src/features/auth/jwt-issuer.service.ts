import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export const JWT_ROLES = ['CUSTOMER', 'STAFF', 'MANAGER'] as const;
export type JwtRole = (typeof JWT_ROLES)[number];

export interface JwtPayload {
  sub: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  userName: string | null;
  role: JwtRole;
  locale: string;
}

@Injectable()
export class JwtIssuerService {
  constructor(private readonly jwt: JwtService) {}

  issueToken(payload: JwtPayload): string {
    return this.jwt.sign(payload);
  }
}
