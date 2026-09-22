import { BackendHttpService } from '../shared/http/backend-http.service';

export type MockBackendHttpService = {
  get: jest.Mock;
  post: jest.Mock;
  patch: jest.Mock;
  put: jest.Mock;
  delete: jest.Mock;
  getForPublic: jest.Mock;
  postForPublic: jest.Mock;
  patchForPublic: jest.Mock;
};

export function makeBackendHttp(
  overrides?: Partial<MockBackendHttpService>,
): jest.Mocked<BackendHttpService> {
  return {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    getForPublic: jest.fn(),
    postForPublic: jest.fn(),
    patchForPublic: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<BackendHttpService>;
}
