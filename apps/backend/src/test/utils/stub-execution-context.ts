import type { ArgumentsHost, ExecutionContext, Type } from '@nestjs/common';

export interface StubHttpRequest {
  headers: Record<string, string | string[] | undefined>;
}

type HttpArgumentsHost = ReturnType<ArgumentsHost['switchToHttp']>;

/**
 * A real `ExecutionContext` for guard specs: the route's handler and controller class plus an HTTP
 * request. It implements the whole interface, so a spec needs no cast; the parts a guard never
 * reads throw if a future guard starts to.
 */
export class StubExecutionContext implements ExecutionContext {
  constructor(
    private readonly handler: (...args: never[]) => unknown,
    private readonly controllerClass: Type<unknown>,
    private readonly request: StubHttpRequest,
  ) {}

  getClass<T = unknown>(): Type<T> {
    return this.controllerClass as Type<T>;
  }

  getHandler(): (...args: never[]) => unknown {
    return this.handler;
  }

  switchToHttp(): HttpArgumentsHost {
    const request = this.request;
    return {
      getRequest: <T = unknown>(): T => request as T,
      getResponse: () => {
        throw new Error('StubExecutionContext has no response');
      },
      getNext: () => {
        throw new Error('StubExecutionContext has no next()');
      },
    };
  }

  getArgs(): never {
    throw new Error('StubExecutionContext.getArgs is not stubbed');
  }

  getArgByIndex(): never {
    throw new Error('StubExecutionContext.getArgByIndex is not stubbed');
  }

  switchToRpc(): never {
    throw new Error('StubExecutionContext.switchToRpc is not stubbed');
  }

  switchToWs(): never {
    throw new Error('StubExecutionContext.switchToWs is not stubbed');
  }

  getType<TContext extends string = string>(): TContext {
    return 'http' as TContext;
  }
}
