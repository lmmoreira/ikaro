import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaffEntityBuilder } from '../../../../test/builders/staff/index';
import { Staff } from '../../domain/staff.aggregate';
import { StaffEntity } from '../entities/staff.entity';
import { TypeOrmStaffRepository } from './typeorm-staff.repository';

describe('TypeOrmStaffRepository', () => {
  let repo: TypeOrmStaffRepository;
  let ormRepo: jest.Mocked<Repository<StaffEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmStaffRepository,
        {
          provide: getRepositoryToken(StaffEntity),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            findAndCount: jest.fn(),
            count: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmStaffRepository);
    ormRepo = moduleRef.get(getRepositoryToken(StaffEntity));
  });

  it('findByTenantAndOAuthId returns null when no row found', async () => {
    ormRepo.findOne.mockResolvedValue(null);
    const result = await repo.findByTenantAndOAuthId('tenant-1', 'sub-1');
    expect(result).toBeNull();
  });

  it('findByTenantAndOAuthId maps entity to domain aggregate with VO-typed email', async () => {
    const entity = new StaffEntityBuilder()
      .withTenantId('tenant-1')
      .withGoogleOAuthId('google-sub-1')
      .withEmail('gerente@lavacar.com.br')
      .withRole('MANAGER')
      .withIsActive(true)
      .build();
    ormRepo.findOne.mockResolvedValue(entity);

    const result = await repo.findByTenantAndOAuthId('tenant-1', 'google-sub-1');

    expect(result).toBeInstanceOf(Staff);
    expect(result!.email.address).toBe('gerente@lavacar.com.br');
    expect(result!.tenantId).toBe('tenant-1');
    expect(result!.role).toBe('MANAGER');
    expect(result!.isActive).toBe(true);
    expect(result!.googleOAuthId).toBe('google-sub-1');
  });

  it('findByTenantAndOAuthId maps entity with null googleOAuthId', async () => {
    const entity = new StaffEntityBuilder().withGoogleOAuthId(null).withIsActive(false).build();
    ormRepo.findOne.mockResolvedValue(entity);

    const result = await repo.findByTenantAndOAuthId('tenant-1', 'sub-1');

    expect(result).toBeInstanceOf(Staff);
    expect(result!.googleOAuthId).toBeNull();
    expect(result!.isActive).toBe(false);
  });

  it('findByGoogleOAuthId returns null when no row found', async () => {
    ormRepo.findOne.mockResolvedValue(null);
    const result = await repo.findByGoogleOAuthId('unknown-sub');
    expect(result).toBeNull();
  });

  it('findByGoogleOAuthId returns the mapped Staff when found', async () => {
    const entity = new StaffEntityBuilder()
      .withGoogleOAuthId('google-sub-1')
      .withIsActive(true)
      .withRole('MANAGER')
      .build();
    ormRepo.findOne.mockResolvedValue(entity);

    const result = await repo.findByGoogleOAuthId('google-sub-1');

    expect(result).toBeInstanceOf(Staff);
    expect(result!.googleOAuthId).toBe('google-sub-1');
    expect(result!.isActive).toBe(true);
    expect(result!.role).toBe('MANAGER');
  });

  it('findByTenantAndEmail returns null when not found', async () => {
    ormRepo.findOne.mockResolvedValue(null);
    const result = await repo.findByTenantAndEmail('tenant-1', 'a@b.com');
    expect(result).toBeNull();
  });

  it('findById returns null when not found', async () => {
    ormRepo.findOne.mockResolvedValue(null);
    const result = await repo.findById('some-id', 'tenant-1');
    expect(result).toBeNull();
  });

  it('findAllByTenant returns mapped domain objects with total', async () => {
    const entities = [
      new StaffEntityBuilder().withId('id-1').withEmail('a@b.com').build(),
      new StaffEntityBuilder().withId('id-2').withEmail('c@d.com').build(),
    ];
    (ormRepo as unknown as { findAndCount: jest.Mock }).findAndCount.mockResolvedValue([
      entities,
      2,
    ]);

    const result = await repo.findAllByTenant('tenant-1', 50, 0);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toBeInstanceOf(Staff);
    expect(result.items[1]).toBeInstanceOf(Staff);
    expect(result.total).toBe(2);
  });

  it('countActiveManagersByTenant returns count', async () => {
    ormRepo.count.mockResolvedValue(2);
    const result = await repo.countActiveManagersByTenant('tenant-1');
    expect(result).toBe(2);
  });

  it('save maps domain to entity and calls repo.save with string email', async () => {
    ormRepo.save.mockResolvedValue(new StaffEntityBuilder().build());
    const staff = Staff.invite(
      'tenant-1',
      'ana@lavacar.com.br',
      'STAFF',
      'Ana Silva',
      null,
      'corr-test',
    );
    await repo.save(staff);
    expect(ormRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ana@lavacar.com.br', tenantId: 'tenant-1' }),
    );
  });
});
