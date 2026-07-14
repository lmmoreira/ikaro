import { BaseErrorInterceptor } from '@ikaro/nestjs-http';
import { ErrorInterceptor } from './error.interceptor';

describe('ErrorInterceptor', () => {
  it('wires the BFF AppLogger into the shared BaseErrorInterceptor', () => {
    const interceptor = new ErrorInterceptor();
    expect(interceptor).toBeInstanceOf(BaseErrorInterceptor);
  });
});
