import { describe, expect, it } from 'vitest';
import { toCsvCell, toCsvRow } from './csv';

describe('toCsvCell', () => {
  it.each([
    ["=cmd|' /C calc'!A0", `"'=cmd|' /C calc'!A0"`],
    ['+SUM(A1:A2)', `"'+SUM(A1:A2)"`],
    ['-2+3', `"'-2+3"`],
    ['@SUM(A1)', `"'@SUM(A1)"`],
    ['\t=1+1', `"'\t=1+1"`],
    ['\r=1+1', `"'\r=1+1"`],
    ['   =HYPERLINK("http://x")', `"'   =HYPERLINK(""http://x"")"`],
  ])('neutralises formula trigger %j', (input, expected) => {
    expect(toCsvCell(input)).toBe(expected);
  });

  it('keeps ordinary values and escapes double quotes', () => {
    expect(toCsvCell('Ana Souza')).toBe('"Ana Souza"');
    expect(toCsvCell('1º')).toBe('"1º"');
    expect(toCsvCell('42 a 77 pts')).toBe('"42 a 77 pts"');
    expect(toCsvCell('Disse "olá"')).toBe('"Disse ""olá"""');
    expect(toCsvCell('a = b')).toBe('"a = b"');
    expect(toCsvCell('')).toBe('""');
  });

  it('joins a row with the separator', () => {
    expect(toCsvRow(['a', '=1', 'b'])).toBe(`"a";"'=1";"b"`);
  });
});
