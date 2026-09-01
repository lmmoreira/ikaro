import { makeBackendHttp } from '../../test/backend-http.mock';
import { ResourceResponse } from './resource.types';
import { ResourceController } from './resource.controller';

const mockResource: ResourceResponse = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'ROOM',
  refId: null,
  name: 'Estúdio 1',
  workingHours: null,
  turnoverMinutes: 0,
  maxCapacity: 12,
  isActive: true,
};

describe('ResourceController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('list()', () => {
    it('calls GET /resources with query params', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue({ items: [mockResource] }),
      });
      const controller = new ResourceController(backendHttp);

      const result = await controller.list({ type: 'ROOM' });

      expect(backendHttp.get).toHaveBeenCalledWith('/resources', { type: 'ROOM' });
      expect(result.items).toHaveLength(1);
    });
  });

  describe('create()', () => {
    it('calls POST /resources and returns the created resource', async () => {
      const backendHttp = makeBackendHttp({
        post: jest.fn().mockResolvedValue(mockResource),
      });
      const controller = new ResourceController(backendHttp);

      const result = await controller.create({ type: 'ROOM', name: 'Estúdio 1', maxCapacity: 12 });

      expect(backendHttp.post).toHaveBeenCalledWith('/resources', {
        type: 'ROOM',
        name: 'Estúdio 1',
        maxCapacity: 12,
      });
      expect(result.id).toBe(mockResource.id);
    });
  });

  describe('update()', () => {
    it('calls PATCH /resources/:id with the working hours body', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest.fn().mockResolvedValue(mockResource),
      });
      const controller = new ResourceController(backendHttp);

      await controller.update(mockResource.id, { workingHours: null });

      expect(backendHttp.patch).toHaveBeenCalledWith(`/resources/${mockResource.id}`, {
        workingHours: null,
      });
    });
  });

  describe('deactivate()', () => {
    it('calls DELETE /resources/:id', async () => {
      const backendHttp = makeBackendHttp({ delete: jest.fn().mockResolvedValue(undefined) });
      const controller = new ResourceController(backendHttp);

      await controller.deactivate(mockResource.id);

      expect(backendHttp.delete).toHaveBeenCalledWith(`/resources/${mockResource.id}`);
    });
  });

  describe('reactivate()', () => {
    it('calls POST /resources/:id/reactivate', async () => {
      const backendHttp = makeBackendHttp({
        post: jest.fn().mockResolvedValue({ ...mockResource, isActive: true }),
      });
      const controller = new ResourceController(backendHttp);

      await controller.reactivate(mockResource.id);

      expect(backendHttp.post).toHaveBeenCalledWith(`/resources/${mockResource.id}/reactivate`, {});
    });
  });
});
