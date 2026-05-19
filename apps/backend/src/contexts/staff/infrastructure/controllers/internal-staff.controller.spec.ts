import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { StaffBuilder } from '../../../../test/builders/staff';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { ActivateStaffUseCase } from '../../application/use-cases/activate-staff.use-case';
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
      new ActivateStaffUseCase(repo, new InMemoryTransactionManager()),
    );
  });

  describe('getByOAuth()', () => {
    it('throws BadRequestException when googleOAuthId is missing', async () => {
      await expect(controller.getByOAuth('')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('maps StaffNotFoundError to 404 when no staff is found', async () => {
      const err = await controller.getByOAuth('unknown-sub').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('returns GetStaffByOAuthIdUseCaseResult for an active staff member', async () => {
      const staff = new StaffBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000001')
        .withRole('MANAGER')
        .withGoogleOAuthId('google-sub-test')
        .build();
      await repo.save(staff);

      const result = await controller.getByOAuth('google-sub-test');

      expect(result.staffId).toBe(staff.id);
      expect(result.tenantId).toBe(staff.tenantId);
      expect(result.role).toBe('MANAGER');
      expect(result.isActive).toBe(true);
    });
  });

  describe('getByEmail()', () => {
    it('throws BadRequestException when email or tenantId is missing', async () => {
      await expect(controller.getByEmail('', 'tenant-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(controller.getByEmail('a@b.com', '')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('maps StaffNotFoundError to 404 when no staff found for the given email + tenantId', async () => {
      const err = await controller
        .getByEmail('nobody@lavacar.com.br', '10000000-0000-4000-8000-000000000001')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('returns GetStaffByEmailUseCaseResult for an invited (inactive) staff member', async () => {
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
      expect(result.isActive).toBe(false);
    });
  });

  describe('activate()', () => {
    it('maps StaffNotFoundError to 404 for unknown staffId', async () => {
      const err = await controller
        .activate('non-existent', {
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
        .activate(staff.id, {
          tenantId: '10000000-0000-4000-8000-000000000001',
          googleOAuthId: 'google-sub-123',
          email: 'wrong@gmail.com',
          name: 'Staff User',
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('activates staff and returns result', async () => {
      const staff = new StaffBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000001')
        .withEmail('gerente@lavacar.com.br')
        .withRole('MANAGER')
        .build();
      await repo.save(staff);

      const result = await controller.activate(staff.id, {
        tenantId: '10000000-0000-4000-8000-000000000001',
        googleOAuthId: 'google-sub-new',
        email: 'gerente@lavacar.com.br',
        name: 'Gerente Silva',
      });

      expect(result.staffId).toBe(staff.id);
      expect(result.isActive).toBe(true);
      expect(result.role).toBe('MANAGER');
    });
  });
});
