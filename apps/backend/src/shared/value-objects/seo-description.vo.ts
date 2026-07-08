export class SeoDescription {
  static readonly MAX_LENGTH = 158;

  private constructor(private readonly _value: string) {}

  static isValid(description: string): boolean {
    return description.length <= SeoDescription.MAX_LENGTH;
  }

  static create(description: string): SeoDescription {
    if (!SeoDescription.isValid(description)) {
      throw new Error(
        `"${description}" exceeds the maximum SEO description length of ${SeoDescription.MAX_LENGTH}`,
      );
    }
    return new SeoDescription(description);
  }

  static reconstitute(description: string): SeoDescription {
    return new SeoDescription(description);
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }
}
