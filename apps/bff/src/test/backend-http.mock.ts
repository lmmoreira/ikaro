import { BackendHttpService } from '../shared/http/backend-http.service';

export type MockBackendHttpService = {
  get: jest.Mock;
  post: jest.Mock;
  patch: jest.Mock;
  delete: jest.Mock;
  getForPublic: jest.Mock;
};

export function makeBackendHttp(
  overrides?: Partial<MockBackendHttpService>,
): jest.Mocked<BackendHttpService> {
  return {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    getForPublic: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<BackendHttpService>;
}
