import type { TaxIdType } from '@ikaro/i18n';
import { TaxId } from '../../../../shared/value-objects/tax-id.vo';
import {
  SignupRegistration,
  type SignupRegistrationStatus,
  type SignupSource,
} from '../../domain/signup-registration';
import { SignupRegistrationEntity } from '../entities/signup-registration.entity';

export function signupRegistrationToEntity(
  registration: SignupRegistration,
): SignupRegistrationEntity {
  const entity = new SignupRegistrationEntity();
  entity.id = registration.id;
  entity.tenantId = registration.tenantId;
  entity.source = registration.source;
  entity.status = registration.status;
  entity.googleSub = registration.googleSub;
  entity.taxIdType = registration.taxId?.type ?? null;
  entity.taxId = registration.taxId?.value ?? null;
  entity.termsVersion = registration.terms?.version ?? null;
  entity.termsAcceptedAt = registration.terms?.acceptedAt ?? null;
  entity.exempt = registration.exempt;
  entity.createdAt = registration.createdAt;
  return entity;
}

export function signupRegistrationToDomain(entity: SignupRegistrationEntity): SignupRegistration {
  return SignupRegistration.reconstitute({
    id: entity.id,
    tenantId: entity.tenantId,
    source: entity.source as SignupSource,
    status: entity.status as SignupRegistrationStatus,
    googleSub: entity.googleSub,
    taxId:
      entity.taxId !== null && entity.taxIdType !== null
        ? TaxId.reconstitute(entity.taxId, entity.taxIdType as TaxIdType)
        : null,
    terms:
      entity.termsVersion !== null && entity.termsAcceptedAt !== null
        ? { version: entity.termsVersion, acceptedAt: entity.termsAcceptedAt }
        : null,
    exempt: entity.exempt,
    createdAt: entity.createdAt,
  });
}
