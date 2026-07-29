import { SetMetadata } from '@nestjs/common';
import { JwtRole } from '../../features/auth/jwt-issuer.service';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: JwtRole[]) => SetMetadata(ROLES_KEY, roles);
