import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { ISignupRegistrationRepository } from '../../application/ports/signup-registration-repository.port';
import type { SignupRegistration } from '../../domain/signup-registration';
import type { GoogleSubHistoryEntry } from '../../domain/trial-eligibility';
import { SignupRegistrationEntity } from '../entities/signup-registration.entity';
import { SignupRegistrationNotAvailableError } from '../../domain/errors/billing-domain.error';
import {
  signupRegistrationToDomain,
  signupRegistrationToEntity,
} from './typeorm-signup-registration.mapper';

interface HistoryRow {
  status: 'RESERVED' | 'COMPLETED';
  has_ever_paid: boolean;
}

@Injectable()
export class TypeOrmSignupRegistrationRepository implements ISignupRegistrationRepository {
  constructor(
    @InjectRepository(SignupRegistrationEntity)
    private readonly repo: Repository<SignupRegistrationEntity>,
  ) {}

  // Reads `IDX_billing_signup_registrations_google_sub`. A row with no tenant or no subscription
  // yet counts as unpaid (the left join yields NULL, coalesced to false).
  async findGoogleSubHistory(googleSub: string): Promise<GoogleSubHistoryEntry[]> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    const rows: HistoryRow[] = await manager.query(
      `SELECT r.status AS status, COALESCE(s.has_ever_paid, false) AS has_ever_paid
         FROM billing.signup_registrations r
         LEFT JOIN billing.subscriptions s ON s.tenant_id = r.tenant_id
        WHERE r.google_sub = $1 AND r.source = 'SELF_SIGNUP'`,
      [googleSub],
    );
    return rows.map((row) => ({ status: row.status, hasEverPaid: row.has_ever_paid }));
  }

  // The account half reads `IDX_billing_billing_accounts_tax_id`; the registrations table is tiny
  // and short-lived (a RESERVED row lives an hour), so it needs no index of its own.
  async isTaxIdHeldByUnpaid(taxId: string): Promise<boolean> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    const rows: Array<{ held: boolean }> = await manager.query(
      `SELECT EXISTS (
         SELECT 1
           FROM billing.billing_accounts a
           JOIN billing.subscriptions s ON s.tenant_id = a.tenant_id
          WHERE a.tax_id = $1 AND s.has_ever_paid = false
         UNION ALL
         SELECT 1
           FROM billing.signup_registrations r
          WHERE r.tax_id = $1 AND r.status = 'RESERVED'
       ) AS held`,
      [taxId],
    );
    return rows[0]?.held === true;
  }

  async save(registration: SignupRegistration): Promise<void> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    await manager.insert(SignupRegistrationEntity, signupRegistrationToEntity(registration));
  }

  async findById(id: string): Promise<SignupRegistration | null> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    const entity = await manager.findOne(SignupRegistrationEntity, { where: { id } });
    return entity ? signupRegistrationToDomain(entity) : null;
  }

  async complete(registration: SignupRegistration): Promise<void> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    const result = await manager
      .createQueryBuilder()
      .update(SignupRegistrationEntity)
      .set({
        tenantId: registration.tenantId,
        status: registration.status,
        taxIdType: null,
        taxId: null,
      })
      .where('id = :id AND status = :reserved', { id: registration.id, reserved: 'RESERVED' })
      .execute();
    if (result.affected !== 1) throw new SignupRegistrationNotAvailableError(registration.id);
  }
}
