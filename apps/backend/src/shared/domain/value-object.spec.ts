import { ValueObject } from './value-object';

interface NameProps {
  value: string;
}

class Name extends ValueObject<NameProps> {
  static create(value: string) {
    return new Name({ value });
  }
  get value() {
    return this.props.value;
  }
}

describe('ValueObject', () => {
  it('equals returns true for same props', () => {
    expect(Name.create('Alice').equals(Name.create('Alice'))).toBe(true);
  });

  it('equals returns false for different props', () => {
    expect(Name.create('Alice').equals(Name.create('Bob'))).toBe(false);
  });

  it('props are frozen (immutable)', () => {
    const name = Name.create('Alice');
    expect(() => {
      (name as unknown as { props: NameProps }).props.value = 'mutated';
    }).toThrow();
  });
});
