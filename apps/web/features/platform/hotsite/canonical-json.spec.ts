import { describe, expect, it } from 'vitest';
import { canonicalJson, isStructurallyEqual } from './canonical-json';

describe('isStructurallyEqual', () => {
  it('ignores key order at every depth', () => {
    expect(isStructurallyEqual({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(
      true,
    );
  });

  it('keeps array order meaningful', () => {
    expect(isStructurallyEqual([1, 2], [2, 1])).toBe(false);
  });

  it('treats an undefined entry as absent', () => {
    expect(isStructurallyEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it('tells apart different values, types and null', () => {
    expect(isStructurallyEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(isStructurallyEqual({ a: '1' }, { a: 1 })).toBe(false);
    expect(isStructurallyEqual({ a: null }, {})).toBe(false);
  });
});

describe('canonicalJson', () => {
  it('is stable for equal data', () => {
    expect(canonicalJson({ z: [1, { y: 2, x: 1 }], a: 'b' })).toBe(
      canonicalJson({ a: 'b', z: [1, { x: 1, y: 2 }] }),
    );
  });
});
