const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export class HexColor {
  private constructor(private readonly _value: string) {}

  static isValid(color: string): boolean {
    return HEX_COLOR_PATTERN.test(color);
  }

  static create(color: string): HexColor {
    if (!HexColor.isValid(color)) {
      throw new Error(`"${color}" is not a valid hex color — expected #RRGGBB`);
    }
    return new HexColor(color.toUpperCase());
  }

  static reconstitute(color: string): HexColor {
    return new HexColor(color.toUpperCase());
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }
}
