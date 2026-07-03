import { INestApplication } from '@nestjs/common';
import { applySecurityHeaders } from './security-headers';

describe('applySecurityHeaders', () => {
  it('registers helmet as Express middleware on the app', () => {
    const app = { use: jest.fn() } as unknown as INestApplication;

    applySecurityHeaders(app);

    expect(app.use).toHaveBeenCalledTimes(1);
    expect(app.use).toHaveBeenCalledWith(expect.any(Function));
  });
});
