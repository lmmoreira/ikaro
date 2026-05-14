import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    // Implemented in M03 — Authentication
    return true;
  }
}
