import { StubExecutionContext } from './stub-execution-context';

class Controller {
  handler(): void {}
}

describe('StubExecutionContext', () => {
  const request = { headers: { 'x-tenant-id': 't' } };
  const context = new StubExecutionContext(Controller.prototype.handler, Controller, request);

  it('exposes the handler, the controller class and the request a guard reads', () => {
    expect(context.getHandler()).toBe(Controller.prototype.handler);
    expect(context.getClass()).toBe(Controller);
    expect(context.switchToHttp().getRequest()).toBe(request);
    expect(context.getType()).toBe('http');
  });

  it('throws on every part a guard is not meant to read, so a new dependency is noticed', () => {
    expect(() => context.switchToHttp().getResponse()).toThrow('no response');
    expect(() => context.switchToHttp().getNext()).toThrow('no next()');
    expect(() => context.getArgs()).toThrow('not stubbed');
    expect(() => context.getArgByIndex()).toThrow('not stubbed');
    expect(() => context.switchToRpc()).toThrow('not stubbed');
    expect(() => context.switchToWs()).toThrow('not stubbed');
  });
});
