import { SetMetadata } from '@nestjs/common';
import { ActorRole } from '@ikaro/types';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: ActorRole[]) => SetMetadata(ROLES_KEY, roles);
