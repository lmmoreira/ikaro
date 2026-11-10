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

  it('makes the tax id optional free text for US, labelled for an EIN', () => {
    expect(US).toMatchObject({ required: false, types: ['OTHER'], maxLength: 32 });
    expect(US.label).toBe('Tax ID (EIN)');
  });

  it('makes the tax id optional free text for the fallback', () => {
    expect(FALLBACK).toMatchObject({ required: false, types: ['OTHER'], maxLength: 32 });
  });

  it('never mentions CPF or CNPJ outside BR', () => {
    expect(`${US.label}${US.placeholder}${FALLBACK.label}`).not.toMatch(/CPF|CNPJ/);
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

  it('treats a CNPJ-shaped value as plain free text where only OTHER is accepted', () => {
    expect(TaxId.create('11222333000182', US).type).toBe('OTHER');
  });
});

describe('TaxId — free text (US and fallback)', () => {
  it('stores the trimmed value typed OTHER with no format check', () => {
    const taxId = TaxId.create('  12-3456789  ', US);
    expect(taxId.value).toBe('12-3456789');
    expect(taxId.type).toBe('OTHER');
  });

  it('keeps a free-text value as typed (no uppercase, no punctuation stripping)', () => {
    expect(TaxId.create('ab-12.x', FALLBACK).value).toBe('ab-12.x');
  });

  it('accepts exactly 32 characters and rejects 33', () => {
    expect(TaxId.create('x'.repeat(32), US).value).toHaveLength(32);
    expect(codeOf(() => TaxId.create('x'.repeat(33), US))).toBe(SignupErrorCode.TAX_ID_INVALID);
  });
});

describe('TaxId — required and optional', () => {
  it.each([null, undefined, '', '   '])('createOptional(%j) is required for BR', (raw) => {
    expect(codeOf(() => TaxId.createOptional(raw, BR))).toBe(SignupErrorCode.TAX_ID_REQUIRED);
  });

  it.each([null, undefined, '', '   '])('createOptional(%j) is absent for US', (raw) => {
    expect(TaxId.createOptional(raw, US)).toBeNull();
  });

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
