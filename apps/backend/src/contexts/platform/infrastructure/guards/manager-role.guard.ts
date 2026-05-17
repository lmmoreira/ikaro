import { CanActivate, Injectable } from '@nestjs/common';

// Stub: always allows access. M03 will enforce the MANAGER role from the JWT payload.
@Injectable()
export class ManagerRoleGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}
