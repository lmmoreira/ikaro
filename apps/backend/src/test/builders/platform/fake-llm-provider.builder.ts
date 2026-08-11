import {
  ChatCompletionRequest,
  ChatCompletionResult,
  ILlmProvider,
} from '../../../contexts/platform/application/ports/llm-provider.port';

class FakeLlmProvider implements ILlmProvider {
  constructor(private readonly result: ChatCompletionResult) {}

  async complete(_request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    return this.result;
  }
}

export class FakeLlmProviderBuilder {
  private text = 'Fake LLM response';
  private inputTokens = 100;
  private outputTokens = 20;
  private readonly modelId = 'fake-model';

  withText(text: string): this {
    this.text = text;
    return this;
  }

  withInputTokens(inputTokens: number): this {
    this.inputTokens = inputTokens;
    return this;
  }

  withOutputTokens(outputTokens: number): this {
    this.outputTokens = outputTokens;
    return this;
  }

  build(): ILlmProvider {
    return new FakeLlmProvider({
      text: this.text,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      modelId: this.modelId,
    });
  }
}
