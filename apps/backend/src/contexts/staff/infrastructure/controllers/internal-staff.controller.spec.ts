import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { StaffBuilder } from '../../../../test/builders/staff';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { ActivateStaffUseCase } from '../../application/use-cases/activate-staff.use-case';
import { GetStaffByEmailUseCase } from '../../application/use-cases/get-staff-by-email.use-case';
import { GetStaffByIdUseCase } from '../../application/use-cases/get-staff-by-id.use-case';
import { GetStaffByOAuthIdUseCase } from '../../application/use-cases/get-staff-by-oauth-id.use-case';
import { InviteStaffUseCase } from '../../application/use-cases/invite-staff.use-case';
import { ListStaffUseCase } from '../../application/use-cases/list-staff.use-case';
import { InternalStaffController } from './internal-staff.controller';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';
const MANAGER_ID = '20000000-0000-4000-8000-000000000001';

describe('InternalStaffController', () => {
  let repo: InMemoryStaffRepository;
  let eventBus: InMemoryEventBus;
  let controller: InternalStaffController;

  beforeEach(() => {
    repo = new InMemoryStaffRepository();
    eventBus = new InMemoryEventBus();
    controller = new InternalStaffController(
      new GetStaffByOAuthIdUseCase(repo),
      new GetStaffByEmailUseCase(repo),
      new ActivateStaffUseCase(repo, new InMemoryTransactionManager()),
      new ListStaffUseCase(repo),
      new GetStaffByIdUseCase(repo),
      new InviteStaffUseCase(repo, new InMemoryTransactionManager(), eventBus),
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

  describe('list()', () => {
    it('returns empty list when tenant has no staff', async () => {
      const result = await controller.list(TENANT_A, 50, 0);

      expect(result.items).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });

    it('returns only staff from the given tenant', async () => {
      const staffA = new StaffBuilder().withTenantId(TENANT_A).withEmail('a@a.com').build();
      const staffB = new StaffBuilder().withTenantId(TENANT_B).withEmail('b@b.com').build();
      await repo.save(staffA);
      await repo.save(staffB);

      const result = await controller.list(TENANT_A, 50, 0);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].email).toBe('a@a.com');
      expect(result.pagination.total).toBe(1);
    });

    it('hasMore and nextOffset are set correctly when paginating', async () => {
      for (let i = 1; i <= 3; i++) {
        await repo.save(new StaffBuilder().withTenantId(TENANT_A).withEmail(`s${i}@a.com`).build());
      }

      const result = await controller.list(TENANT_A, 2, 0);

      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextOffset).toBe(2);
    });
  });

  describe('getById()', () => {
    it('maps StaffNotFoundError to 404 when id does not exist', async () => {
      const err = await controller.getById('non-existent', TENANT_A).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('returns the staff member with correct shape', async () => {
      const staff = new StaffBuilder()
        .withTenantId(TENANT_A)
        .withEmail('gerente@lavacar.com.br')
        .withRole('MANAGER')
        .withGoogleOAuthId('google-sub-1')
        .withName('Gerente Silva')
        .build();
      await repo.save(staff);

      const result = await controller.getById(staff.id, TENANT_A);

      expect(result.id).toBe(staff.id);
      expect(result.email).toBe('gerente@lavacar.com.br');
      expect(result.name).toBe('Gerente Silva');
      expect(result.role).toBe('MANAGER');
    });

    it('maps StaffNotFoundError to 404 for staff from a different tenant (isolation)', async () => {
      const staff = new StaffBuilder().withTenantId(TENANT_A).withEmail('a@a.com').build();
      await repo.save(staff);

      const err = await controller.getById(staff.id, TENANT_B).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('invite()', () => {
    const inviteDto = {
      tenantId: TENANT_A,
      email: 'novo@lavacar.com.br',
      firstName: 'João',
      lastName: 'Silva',
      role: 'STAFF' as const,
      invitedBy: MANAGER_ID,
    };

    it('creates staff and returns 201 result', async () => {
      const result = await controller.invite(inviteDto);

      expect(result.email).toBe('novo@lavacar.com.br');
      expect(result.role).toBe('STAFF');
      expect(result.isActive).toBe(false);
      expect(result.staffId).toBeDefined();
    });

    it('maps StaffAlreadyExistsError to 409 when email is already active', async () => {
      const active = new StaffBuilder()
        .withTenantId(TENANT_A)
        .withEmail('novo@lavacar.com.br')
        .withGoogleOAuthId('google-sub-active')
        .build();
      await repo.save(active);

      const err = await controller.invite(inviteDto).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    });
  });
});
