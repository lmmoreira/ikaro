import { countrySpec } from '@ikaro/i18n';
import { SignupErrorCode } from '@ikaro/types';
import { TaxId, TaxIdValidationError } from './tax-id.vo';

const BR = countrySpec('BR').taxId;
const US = countrySpec('US').taxId;
const FALLBACK = countrySpec('ZZ').taxId;

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(TaxIdValidationError);
    return (error as TaxIdValidationError).code;
  }
  return undefined;
}

describe('CountrySpec.taxId', () => {
  it('requires a CPF or CNPJ for BR', () => {
    expect(BR.required).toBe(true);
    expect(BR.types).toEqual(['CNPJ', 'CPF']);
  });

  it('makes the tax id optional for US: an EIN, or another document declared as OTHER', () => {
    expect(US).toMatchObject({ required: false, types: ['EIN', 'OTHER'], maxLength: 32 });
  });

  it('gives every accepted type its own placeholder', () => {
    for (const spec of [BR, US, FALLBACK]) {
      expect(Object.keys(spec.placeholders).sort()).toEqual([...spec.types].sort());
    }
    expect(BR.placeholders).toEqual({ CNPJ: '00.000.000/0000-00', CPF: '000.000.000-00' });
  });

  it('makes the tax id optional free text for the fallback', () => {
    expect(FALLBACK).toMatchObject({ required: false, types: ['OTHER'], maxLength: 32 });
  });

  it('never mentions CPF or CNPJ outside BR', () => {
    const text = [US, FALLBACK].flatMap((spec) => [
      spec.label,
      ...Object.values(spec.placeholders),
    ]);
    expect(text.join(' ')).not.toMatch(/CPF|CNPJ/);
  });
});

describe('TaxId — CPF', () => {
  it.each(['52998224725', '529.982.247-25', ' 529.982.247-25 ', '11144477735'])(
    'accepts the valid CPF %s and stores it digits-only',
    (raw) => {
      const taxId = TaxId.create(raw, BR);
      expect(taxId.type).toBe('CPF');
      expect(taxId.value).toBe(raw.replace(/\D/g, ''));
    },
  );

  it.each([
    ['a wrong check digit', '52998224726'],
    ['a repeated-digit value', '11111111111'],
    ['too few digits', '5299822472'],
    ['too many digits', '529982247251'],
    ['a letter', '5299822472A'],
  ])('rejects a CPF with %s', (_label, raw) => {
    expect(codeOf(() => TaxId.create(raw, BR))).toBe(SignupErrorCode.TAX_ID_INVALID);
  });
});

describe('TaxId — CNPJ', () => {
  it.each(['11222333000181', '11.222.333/0001-81'])('accepts the valid numeric CNPJ %s', (raw) => {
    const taxId = TaxId.create(raw, BR);
    expect(taxId.type).toBe('CNPJ');
    expect(taxId.value).toBe('11222333000181');
  });

  it.each(['12ABC34501DE35', '12.ABC.345/01DE-35', '12.abc.345/01de-35'])(
    'accepts the valid alphanumeric CNPJ %s and stores it normalised',
    (raw) => {
      const taxId = TaxId.create(raw, BR);
      expect(taxId.type).toBe('CNPJ');
      expect(taxId.value).toBe('12ABC34501DE35');
    },
  );

  it.each([
    ['a wrong check digit', '11222333000182'],
    ['a wrong check digit on an alphanumeric id', '12ABC34501DE36'],
    ['a repeated-digit value', '00000000000000'],
    ['a letter in the check digits', '12ABC34501DEA5'],
    ['too few characters', '1122233300018'],
    ['too many characters', '112223330001811'],
  ])('rejects a CNPJ with %s', (_label, raw) => {
    expect(codeOf(() => TaxId.create(raw, BR))).toBe(SignupErrorCode.TAX_ID_INVALID);
  });

  it('rejects a CNPJ where only an EIN is accepted', () => {
    expect(codeOf(() => TaxId.create('11222333000181', US))).toBe(SignupErrorCode.TAX_ID_INVALID);
  });
});

describe('TaxId — EIN (US)', () => {
  it.each(['123456789', '12-3456789', ' 12-3456789 '])(
    'accepts %s and stores it digits-only',
    (raw) => {
      const taxId = TaxId.create(raw, US);
      expect(taxId.type).toBe('EIN');
      expect(taxId.value).toBe('123456789');
      expect(TaxId.create(raw, US, 'EIN').value).toBe('123456789');
    },
  );

  it.each([
    ['too few digits', '12-345678'],
    ['too many digits', '12-34567890'],
    ['a letter', '12-345678A'],
    ['an SSN-shaped value with a letter', '123-45-6789x'],
  ])('rejects an EIN with %s', (_label, raw) => {
    expect(codeOf(() => TaxId.create(raw, US))).toBe(SignupErrorCode.TAX_ID_INVALID);
    expect(codeOf(() => TaxId.create(raw, US, 'EIN'))).toBe(SignupErrorCode.TAX_ID_INVALID);
  });

  it('rejects a CNPJ or CPF value for the US', () => {
    expect(codeOf(() => TaxId.create('11222333000181', US))).toBe(SignupErrorCode.TAX_ID_INVALID);
    expect(codeOf(() => TaxId.create('52998224725', US, 'CPF'))).toBe(
      SignupErrorCode.TAX_ID_INVALID,
    );
  });
});

describe('TaxId — OTHER document (US)', () => {
  it('stores the trimmed value typed OTHER when the user declares OTHER, with no format check', () => {
    const taxId = TaxId.create('  123-45-6789  ', US, 'OTHER');
    expect(taxId.type).toBe('OTHER');
    expect(taxId.value).toBe('123-45-6789');
  });

  it('never falls back to OTHER on its own: an undeclared non-EIN value is refused', () => {
    expect(codeOf(() => TaxId.create('A1234567', US))).toBe(SignupErrorCode.TAX_ID_INVALID);
  });

  it('cannot tell a nine-digit SSN from an EIN by shape: undeclared it is read as an EIN', () => {
    expect(TaxId.create('123-45-6789', US).type).toBe('EIN');
    expect(TaxId.create('123-45-6789', US, 'OTHER').type).toBe('OTHER');
  });

  it('accepts exactly 32 characters of OTHER and rejects 33', () => {
    expect(TaxId.create('x'.repeat(32), US, 'OTHER').value).toHaveLength(32);
    expect(codeOf(() => TaxId.create('x'.repeat(33), US, 'OTHER'))).toBe(
      SignupErrorCode.TAX_ID_INVALID,
    );
  });

  it('counts characters, not UTF-16 code units: 32 emoji fit, 33 do not', () => {
    expect([...TaxId.create('😀'.repeat(32), US, 'OTHER').value]).toHaveLength(32);
    expect(codeOf(() => TaxId.create('😀'.repeat(33), US, 'OTHER'))).toBe(
      SignupErrorCode.TAX_ID_INVALID,
    );
  });

  it('checks a declared EIN as an EIN even when the value would pass as OTHER', () => {
    expect(codeOf(() => TaxId.create('abc', US, 'EIN'))).toBe(SignupErrorCode.TAX_ID_INVALID);
  });
});

describe('TaxId — a declared type the country does not accept', () => {
  it.each([
    ['OTHER in BR', '52998224725', BR, 'OTHER'],
    ['EIN in BR', '123456789', BR, 'EIN'],
    ['CPF in the US', '52998224725', US, 'CPF'],
    ['CNPJ in the US', '11222333000181', US, 'CNPJ'],
    ['EIN in the fallback', '123456789', FALLBACK, 'EIN'],
  ] as const)('refuses %s', (_label, raw, spec, declared) => {
    expect(codeOf(() => TaxId.create(raw, spec, declared))).toBe(SignupErrorCode.TAX_ID_INVALID);
  });

  it('checks a declared BR type against its own rule', () => {
    expect(TaxId.create('52998224725', BR, 'CPF').type).toBe('CPF');
    expect(codeOf(() => TaxId.create('52998224725', BR, 'CNPJ'))).toBe(
      SignupErrorCode.TAX_ID_INVALID,
    );
  });
});

describe('TaxId — free text (a country with no rule of its own)', () => {
  it('stores the trimmed value typed OTHER with no format check', () => {
    const taxId = TaxId.create('  12-3456789  ', FALLBACK);
    expect(taxId.value).toBe('12-3456789');
    expect(taxId.type).toBe('OTHER');
  });

  it('keeps a free-text value as typed (no uppercase, no punctuation stripping)', () => {
    expect(TaxId.create('ab-12.x', FALLBACK).value).toBe('ab-12.x');
  });

  it('accepts exactly 32 characters and rejects 33', () => {
    expect(TaxId.create('x'.repeat(32), FALLBACK).value).toHaveLength(32);
    expect(codeOf(() => TaxId.create('x'.repeat(33), FALLBACK))).toBe(
      SignupErrorCode.TAX_ID_INVALID,
    );
  });
});

describe('TaxId — required and optional', () => {
  it.each([null, undefined, '', '   '])('createOptional(%j) is required for BR', (raw) => {
    expect(codeOf(() => TaxId.createOptional(raw, BR))).toBe(SignupErrorCode.TAX_ID_REQUIRED);
  });

  it.each([null, undefined, '', '   '])(
    'createOptional(%j) is absent for US and the fallback',
    (raw) => {
      expect(TaxId.createOptional(raw, US)).toBeNull();
      expect(TaxId.createOptional(raw, FALLBACK)).toBeNull();
    },
  );

  it('createOptional validates a present value', () => {
    expect(TaxId.createOptional('52998224725', BR)?.value).toBe('52998224725');
    expect(codeOf(() => TaxId.createOptional('52998224726', BR))).toBe(
      SignupErrorCode.TAX_ID_INVALID,
    );
  });

  it('create() of a blank value is SIGNUP_TAX_ID_REQUIRED', () => {
    expect(codeOf(() => TaxId.create('', BR))).toBe(SignupErrorCode.TAX_ID_REQUIRED);
  });
});

describe('TaxId — isAllowedFor (the type belongs to the country)', () => {
  it('lets BR hold a CPF or CNPJ and nothing else', () => {
    expect(TaxId.reconstitute('52998224725', 'CPF').isAllowedFor(BR)).toBe(true);
    expect(TaxId.reconstitute('11222333000181', 'CNPJ').isAllowedFor(BR)).toBe(true);
    expect(TaxId.reconstitute('123456789', 'EIN').isAllowedFor(BR)).toBe(false);
    expect(TaxId.reconstitute('x', 'OTHER').isAllowedFor(BR)).toBe(false);
  });

  it('lets US hold an EIN or OTHER and no Brazilian document', () => {
    expect(TaxId.reconstitute('123456789', 'EIN').isAllowedFor(US)).toBe(true);
    expect(TaxId.reconstitute('x', 'OTHER').isAllowedFor(US)).toBe(true);
    expect(TaxId.reconstitute('52998224725', 'CPF').isAllowedFor(US)).toBe(false);
    expect(TaxId.reconstitute('11222333000181', 'CNPJ').isAllowedFor(US)).toBe(false);
  });

  it('lets a country with no rule of its own hold OTHER only', () => {
    expect(TaxId.reconstitute('x', 'OTHER').isAllowedFor(FALLBACK)).toBe(true);
    expect(TaxId.reconstitute('123456789', 'EIN').isAllowedFor(FALLBACK)).toBe(false);
  });

  it('only ever builds a type its own country accepts', () => {
    expect(TaxId.create('11222333000181', BR).isAllowedFor(BR)).toBe(true);
    expect(TaxId.create('12-3456789', US).isAllowedFor(US)).toBe(true);
    expect(TaxId.create('anything', US, 'OTHER').isAllowedFor(US)).toBe(true);
    expect(TaxId.create('anything', FALLBACK).isAllowedFor(FALLBACK)).toBe(true);
  });
});

describe('TaxId — reconstitute and value semantics', () => {
  it('reconstitute() skips validation', () => {
    const taxId = TaxId.reconstitute('not-a-cpf', 'CPF');
    expect(taxId.value).toBe('not-a-cpf');
    expect(taxId.type).toBe('CPF');
    expect(taxId.toString()).toBe('not-a-cpf');
  });

  it('equals() compares value and type', () => {
    expect(
      TaxId.create('529.982.247-25', BR).equals(TaxId.reconstitute('52998224725', 'CPF')),
    ).toBe(true);
    expect(TaxId.reconstitute('1', 'OTHER').equals(TaxId.reconstitute('1', 'CPF'))).toBe(false);
  });

  it('TaxIdValidationError keeps its prototype chain', () => {
    const error = new TaxIdValidationError('x', SignupErrorCode.TAX_ID_INVALID);
    expect(error).toBeInstanceOf(TaxIdValidationError);
    expect(error).toBeInstanceOf(Error);
  });
});
