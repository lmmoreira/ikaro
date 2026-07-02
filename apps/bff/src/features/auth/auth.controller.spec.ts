import { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthControllerFlowService } from './auth-controller-flow.service';

type FlowServiceMock = {
  handleGoogleCallback: jest.Mock;
  logout: jest.Mock;
  getStaffTenants: jest.Mock;
  switchStaffTenant: jest.Mock;
  switchTenant: jest.Mock;
  devLogin: jest.Mock;
};

const makeRes = (): jest.Mocked<Response> =>
  ({
    redirect: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  }) as unknown as jest.Mocked<Response>;

const makeFlowService = (overrides?: Partial<FlowServiceMock>): FlowServiceMock => ({
  handleGoogleCallback: jest.fn(),
  logout: jest.fn(),
  getStaffTenants: jest.fn(),
  switchStaffTenant: jest.fn(),
  switchTenant: jest.fn(),
  devLogin: jest.fn(),
  ...overrides,
});

describe('AuthController', () => {
  it('delegates Google callback handling to the flow service', async () => {
    const flow = makeFlowService({
      handleGoogleCallback: jest.fn().mockResolvedValue(undefined),
    });
    const controller = new AuthController(flow as unknown as AuthControllerFlowService);
    const req = { user: { googleOAuthId: 'google-sub-123' } } as unknown as Request;
    const res = makeRes();

    await controller.handleGoogleCallback(req, res);

    expect(flow.handleGoogleCallback).toHaveBeenCalledWith(req.user, res);
  });

  it('delegates logout to the flow service', () => {
    const flow = makeFlowService();
    const controller = new AuthController(flow as unknown as AuthControllerFlowService);
    const res = makeRes();

    controller.logout('lavacar-bh', res);

    expect(flow.logout).toHaveBeenCalledWith('lavacar-bh', res);
  });

  it('delegates staff tenant lookup to the flow service', async () => {
    const flow = makeFlowService({
      getStaffTenants: jest.fn().mockResolvedValue([{ tenantId: 'tenant-uuid' }]),
    });
    const controller = new AuthController(flow as unknown as AuthControllerFlowService);

    await expect(controller.getStaffTenants()).resolves.toEqual([{ tenantId: 'tenant-uuid' }]);
    expect(flow.getStaffTenants).toHaveBeenCalledTimes(1);
  });

  it('delegates staff tenant switching to the flow service', async () => {
    const flow = makeFlowService({
      switchStaffTenant: jest.fn().mockResolvedValue({ tenantSlug: 'lavacar-bh', expiresIn: '7d' }),
    });
    const controller = new AuthController(flow as unknown as AuthControllerFlowService);
    const dto = { staffId: 'staff-uuid' };
    const currentUser = { userName: 'João Silva' };
    const res = makeRes();

    await expect(controller.switchStaffTenant(dto, currentUser as never, res)).resolves.toEqual({
      tenantSlug: 'lavacar-bh',
      expiresIn: '7d',
    });
    expect(flow.switchStaffTenant).toHaveBeenCalledWith(dto, currentUser, res);
  });

  it('delegates customer tenant switching to the flow service', async () => {
    const flow = makeFlowService({
      switchTenant: jest.fn().mockResolvedValue({ tenantSlug: 'lavacar-bh', expiresIn: '7d' }),
    });
    const controller = new AuthController(flow as unknown as AuthControllerFlowService);
    const dto = { targetTenantId: 'tenant-uuid' };
    const currentUser = { userName: 'João Silva' };
    const res = makeRes();

    await expect(controller.switchTenant(dto, currentUser as never, res)).resolves.toEqual({
      tenantSlug: 'lavacar-bh',
      expiresIn: '7d',
    });
    expect(flow.switchTenant).toHaveBeenCalledWith(dto, currentUser, res);
  });

  it('delegates dev login to the flow service', async () => {
    const flow = makeFlowService({
      devLogin: jest.fn().mockResolvedValue({
        accessToken: 'token',
        user: {
          sub: 'customer-uuid',
          tenantId: 'tenant-uuid',
          tenantSlug: 'lavacar-bh',
          role: 'CUSTOMER',
        },
      }),
    });
    const controller = new AuthController(flow as unknown as AuthControllerFlowService);
    const res = makeRes();
    const dto = { email: 'joao@gmail.com', tenantSlug: 'lavacar-bh', type: 'customer' };

    await expect(controller.devLogin(dto as never, res)).resolves.toEqual({
      accessToken: 'token',
      user: {
        sub: 'customer-uuid',
        tenantId: 'tenant-uuid',
        tenantSlug: 'lavacar-bh',
        role: 'CUSTOMER',
      },
    });
    expect(flow.devLogin).toHaveBeenCalledWith(dto, res);
  });
});
