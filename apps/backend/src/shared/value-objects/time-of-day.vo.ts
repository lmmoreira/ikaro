const HHMM_PATTERN = /^\d{2}:\d{2}$/;
const HHMMSS_PATTERN = /^\d{2}:\d{2}:\d{2}$/;

// PostgreSQL TIME columns return HH:MM:SS; normalise to HH:MM before validation.
function normalise(time: string): string {
  return HHMMSS_PATTERN.test(time) ? time.slice(0, 5) : time;
}

export class TimeOfDay {
  private constructor(private readonly _value: string) {}

  static isValid(time: string): boolean {
    const hhmm = normalise(time);
    if (!HHMM_PATTERN.test(hhmm)) return false;
    const [hh, mm] = hhmm.split(':').map(Number) as [number, number];
    return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
  }

  static create(time: string): TimeOfDay {
    const hhmm = normalise(time);
    if (!TimeOfDay.isValid(hhmm)) {
      throw new Error(`"${time}" is not a valid time — expected HH:MM or HH:MM:SS (00:00–23:59)`);
    }
    return new TimeOfDay(hhmm);
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }

  isBefore(other: TimeOfDay): boolean {
    return this._value < other._value;
  }
}
