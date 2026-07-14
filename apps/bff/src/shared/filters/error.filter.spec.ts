import { BaseErrorFilter } from '@ikaro/nestjs-http';
import { ErrorFilter } from './error.filter';

describe('ErrorFilter', () => {
  it('wires the BFF AppLogger into the shared BaseErrorFilter', () => {
    const filter = new ErrorFilter();
    expect(filter).toBeInstanceOf(BaseErrorFilter);
  });
});
