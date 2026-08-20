import { describe, expect, it } from 'vitest';
import { previewCsv } from './csv';

describe('CSV preview', () => {
  it('parses commas, escaped quotes, and newlines inside quoted fields', () => {
    const preview = previewCsv(
      'division,team\n"Mixed, 3.5","Smith / ""Ace"" Jones"\n"Mixed, 3.5","Davis\n/ Chen"',
      []
    );

    expect(preview.errors).toEqual([]);
    expect(preview.rows).toEqual([
      { line: 2, division: 'Mixed, 3.5', team: 'Smith / "Ace" Jones' },
      { line: 3, division: 'Mixed, 3.5', team: 'Davis\n/ Chen' }
    ]);
    expect(preview.newDivisions).toEqual(['Mixed, 3.5']);
  });

  it('reports malformed quoted fields with the record line', () => {
    const preview = previewCsv('division,team\n"Mixed 3.5,Smith / Jones', []);

    expect(preview.rows).toEqual([]);
    expect(preview.errors).toEqual(['Line 2: unterminated quoted field.']);
  });
});
