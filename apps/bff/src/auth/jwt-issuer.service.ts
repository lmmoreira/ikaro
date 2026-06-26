import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export type JwtRole = 'CUSTOMER' | 'STAFF' | 'MANAGER';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  userName: string | null;
  role: JwtRole;
}

@Injectable()
export class JwtIssuerService {
  constructor(private readonly jwt: JwtService) {}

  issueToken(payload: JwtPayload): string {
    return this.jwt.sign(payload);
  }
}
