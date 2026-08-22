import { describe, expect, it } from 'vitest';
import { commitImportReview, inspectImportFile, inspectImportText, reviewImportWorkbook, type ImportWorkbook } from './importPipeline';
import type { Division, Team } from './types';

function division(id: string, name: string): Division {
  return { id, tournamentId: 'tournament-1', name, poolCount: 2, poolRoundCount: 6, startTime: '2026-08-21T09:00', warmupMinutes: 2, gameMinutes: 13, minimumRestMinutes: 15, playoffQualifiersPerPool: 1 };
}

function team(id: string, divisionId: string, name: string): Team {
  return { id, divisionId, name };
}

function workbook(sheets: ImportWorkbook['sheets']): ImportWorkbook {
  return { sourceName: 'registrations.xlsx', sheets };
}

describe('team import pipeline', () => {
  it('joins participant columns and reconciles reordered division labels', () => {
    const review = reviewImportWorkbook(workbook([{ name: 'Registrations', rows: [
      ['Title row'],
      ['Division', 'Player 1', 'Player 2', 'Email'],
      ['3.5 Mixed', 'Smith', 'Jones', 'smith@example.test'],
      ['Mixed 3.5', 'Davis', '', '']
    ] }]), [division('division-1', 'Mixed 3.5')], []);

    expect(review.errors).toEqual([]);
    expect(review.rows.map((row) => [row.division, row.team])).toEqual([
      ['Mixed 3.5', 'Smith / Jones'],
      ['Mixed 3.5', 'Davis']
    ]);
    expect(review.rows.every((row) => row.included)).toBe(true);
    expect(review.mappings[0].ignoredColumns[0].header).toBe('Email');
  });

  it('reads division names used as column headers', () => {
    const review = reviewImportWorkbook(workbook([{ name: 'Entries', rows: [
      ['Mixed 3.5', "Men's 4.0", 'Player 1'],
      ['Smith / Jones', 'Brown / Lee', 'unrelated']
    ] }]), [], []);

    expect(review.rows.map((row) => `${row.division}:${row.team}`)).toEqual([
      'Mixed 3.5:Smith / Jones',
      "Men's 4.0:Brown / Lee"
    ]);
    expect(review.mappings[0].layout).toBe('Division names as column headers');
  });

  it('fills down confirmed section markers and leaves a leading ambiguous row unresolved', () => {
    const review = reviewImportWorkbook(workbook([{ name: 'Registration list', rows: [
      ['Smith / Jones'],
      ['Mixed 3.5'],
      ['Davis / Chen'],
      ['Taylor / Lee'],
      ["Men's 4.0"],
      ['Brown / Fox']
    ] }]), [], []);

    expect(review.rows.find((row) => row.team === 'Smith / Jones')?.included).toBe(false);
    expect(review.rows.filter((row) => row.included).map((row) => row.division)).toEqual(['Mixed 3.5', 'Mixed 3.5', "Men's 4.0"]);
    expect(review.rows.find((row) => row.team === 'Smith / Jones')?.warnings).toContain('Choose a division before importing this row.');
  });

  it('flags duplicates without mutating the tournament and commits only reviewed rows', () => {
    const existingDivision = division('division-1', 'Mixed 3.5');
    const existingTeam = team('team-1', existingDivision.id, 'Smith / Jones');
    const review = inspectImportText('division,team\nMixed 3.5,Smith / Jones\nMixed 3.5,Davis / Chen\nNew 4.0,Brown / Fox', [existingDivision], [existingTeam]);
    const duplicate = review.rows.find((row) => row.team === 'Smith / Jones')!;
    expect(duplicate.duplicate).toBe('existing');
    expect(duplicate.included).toBe(false);
    expect(review.rows.find((row) => row.team === 'Davis / Chen')?.included).toBe(true);

    const result = commitImportReview(review, [existingDivision], [existingTeam], 'tournament-1', '2026-08-21');
    expect(result.divisions.map((item) => item.name)).toEqual(['Mixed 3.5', 'New 4.0']);
    expect(result.teams.map((item) => item.name)).toEqual(['Smith / Jones', 'Davis / Chen', 'Brown / Fox']);
  });

  it('keeps malformed CSV diagnostics actionable', () => {
    const review = inspectImportText('division,team\n"Mixed 3.5,Smith / Jones', [], []);
    expect(review.rows).toEqual([]);
    expect(review.errors).toEqual(['Line 2: unterminated quoted field.']);
  });

  it('accepts tab-separated cells pasted from a spreadsheet', () => {
    const review = inspectImportText('Division\tPlayer 1\tPlayer 2\nMixed 3.5\tSmith\tJones', [], []);
    expect(review.rows[0]).toMatchObject({ division: 'Mixed 3.5', team: 'Smith / Jones', included: true });
  });

  it('reads an XLSX workbook through the lazy workbook adapter', async () => {
    const XLSX = await import('@e965/xlsx');
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Division', 'Team'],
      ['Mixed 3.5', 'Smith / Jones']
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Registrations');
    const file = new File([XLSX.write(book, { bookType: 'xlsx', type: 'array' })], 'registrations.xlsx');
    const review = await inspectImportFile(file, [], []);
    expect(review.errors).toEqual([]);
    expect(review.rows[0]).toMatchObject({ division: 'Mixed 3.5', team: 'Smith / Jones', source: { sheet: 'Registrations', row: 2 }, included: true });
  });
});
