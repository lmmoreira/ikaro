import { HttpException, HttpStatus } from '@nestjs/common';
import { StaffBuilder } from '../../../../test/builders/staff';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { LinkGoogleAccountUseCase } from '../../application/use-cases/link-google-account.use-case';
import { GetStaffByEmailUseCase } from '../../application/use-cases/get-staff-by-email.use-case';
import { GetStaffByOAuthIdUseCase } from '../../application/use-cases/get-staff-by-oauth-id.use-case';
import { InternalStaffController } from './internal-staff.controller';

describe('InternalStaffController', () => {
  let repo: InMemoryStaffRepository;
  let controller: InternalStaffController;

  beforeEach(() => {
    repo = new InMemoryStaffRepository();
    controller = new InternalStaffController(
      new GetStaffByOAuthIdUseCase(repo),
      new GetStaffByEmailUseCase(repo),
      new LinkGoogleAccountUseCase(repo, new InMemoryTransactionManager()),
    );
  });

  describe('getByOAuth()', () => {
    it('throws a 400 when googleOAuthId is missing', async () => {
      const err = await controller.getByOAuth('').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('returns empty array when no staff is found', async () => {
      const result = await controller.getByOAuth('unknown-sub');
      expect(result).toEqual([]);
    });

    it('returns array with one result for an active staff member', async () => {
      const staff = new StaffBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000001')
        .withRole('MANAGER')
        .withGoogleOAuthId('google-sub-test')
        .build();
      await repo.save(staff);

      const result = await controller.getByOAuth('google-sub-test');

      expect(result).toHaveLength(1);
      expect(result[0].staffId).toBe(staff.id);
      expect(result[0].tenantId).toBe(staff.tenantId);
      expect(result[0].role).toBe('MANAGER');
      expect(result[0].isActive).toBe(true);
    });

    it('returns multiple results when same googleOAuthId is linked across tenants', async () => {
      const staff1 = new StaffBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000001')
        .withGoogleOAuthId('google-sub-multi')
        .build();
      const staff2 = new StaffBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000002')
        .withGoogleOAuthId('google-sub-multi')
        .build();
      await repo.save(staff1);
      await repo.save(staff2);

      const result = await controller.getByOAuth('google-sub-multi');
      expect(result).toHaveLength(2);
    });
  });

  describe('getByEmail()', () => {
    it('throws a 400 when email or tenantId is missing', async () => {
      const err1 = await controller.getByEmail('', 'tenant-1').catch((e: unknown) => e);
      expect(err1).toBeInstanceOf(HttpException);
      expect((err1 as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);

      const err2 = await controller.getByEmail('a@b.com', '').catch((e: unknown) => e);
      expect(err2).toBeInstanceOf(HttpException);
      expect((err2 as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('maps StaffNotFoundError to 404 when no staff found for the given email + tenantId', async () => {
      const err = await controller
        .getByEmail('nobody@lavacar.com.br', '10000000-0000-4000-8000-000000000001')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('returns GetStaffByEmailUseCaseResult for an active staff member', async () => {
      const staff = new StaffBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000001')
        .withEmail('gerente@lavacar.com.br')
        .withRole('MANAGER')
        .build();
      await repo.save(staff);

      const result = await controller.getByEmail(
        'gerente@lavacar.com.br',
        '10000000-0000-4000-8000-000000000001',
      );

      expect(result.staffId).toBe(staff.id);
      expect(result.email).toBe('gerente@lavacar.com.br');
      expect(result.role).toBe('MANAGER');
      expect(result.isActive).toBe(true);
    });
  });

  describe('linkGoogle()', () => {
    it('maps StaffNotFoundError to 404 for unknown staffId', async () => {
      const err = await controller
        .linkGoogle('non-existent', {
          tenantId: '10000000-0000-4000-8000-000000000001',
          googleOAuthId: 'google-sub-123',
          email: 'staff@lavacar.com.br',
          name: 'Staff User',
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('maps StaffEmailMismatchError to 422 when Google email differs', async () => {
      const staff = new StaffBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000001')
        .withEmail('invited@lavacar.com.br')
        .build();
      await repo.save(staff);

      const err = await controller
        .linkGoogle(staff.id, {
          tenantId: '10000000-0000-4000-8000-000000000001',
          googleOAuthId: 'google-sub-123',
          email: 'wrong@gmail.com',
          name: 'Staff User',
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('maps StaffDeactivatedError to 403 when staff is deactivated', async () => {
      const staff = new StaffBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000001')
        .withEmail('gerente@lavacar.com.br')
        .withGoogleOAuthId('google-sub-old')
        .build();
      staff.deactivate('other-staff-id', 'corr-test');
      await repo.save(staff);

      const err = await controller
        .linkGoogle(staff.id, {
          tenantId: '10000000-0000-4000-8000-000000000001',
          googleOAuthId: 'google-sub-new',
          email: 'gerente@lavacar.com.br',
          name: 'Gerente',
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    });

    it('links Google account and returns result', async () => {
      const staff = new StaffBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000001')
        .withEmail('gerente@lavacar.com.br')
        .withRole('MANAGER')
        .build();
      await repo.save(staff);

      const result = await controller.linkGoogle(staff.id, {
        tenantId: '10000000-0000-4000-8000-000000000001',
        googleOAuthId: 'google-sub-new',
        email: 'gerente@lavacar.com.br',
        name: 'Gerente Silva',
      });

      expect(result.staffId).toBe(staff.id);
      expect(result.role).toBe('MANAGER');
      expect(result.tenantId).toBe('10000000-0000-4000-8000-000000000001');
    });
  });
});
