import { ITracingPort, SpanAttributeValue } from '@ikaro/observability';

// State-based `ITracingPort` double: records every `setActiveSpanAttributes` call so a spec can
// assert which attributes a use case put on the active span, without a jest.fn().
export class FakeTracingPort implements ITracingPort {
  readonly calls: Array<Record<string, SpanAttributeValue>> = [];
  setActiveSpanAttributes(attributes: Record<string, SpanAttributeValue>): void {
    this.calls.push(attributes);
  }
  getActiveTraceContext(): undefined {
    return undefined;
  }
  injectContext(): void {}
  runWithExtractedContext<T>(_carrier: Record<string, string>, fn: () => T): T {
    return fn();
  }
  startActiveSpan<T>(_name: string, fn: () => T): T {
    return fn();
  }
}
