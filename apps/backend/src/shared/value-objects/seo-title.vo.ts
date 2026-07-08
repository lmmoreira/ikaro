export class SeoTitle {
  static readonly MAX_LENGTH = 60;

  private constructor(private readonly _value: string) {}

  static isValid(title: string): boolean {
    return title.length <= SeoTitle.MAX_LENGTH;
  }

  static create(title: string): SeoTitle {
    if (!SeoTitle.isValid(title)) {
      throw new Error(`"${title}" exceeds the maximum SEO title length of ${SeoTitle.MAX_LENGTH}`);
    }
    return new SeoTitle(title);
  }

  static reconstitute(title: string): SeoTitle {
    return new SeoTitle(title);
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }
}
