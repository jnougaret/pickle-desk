import { describe, expect, it } from 'vitest';
import { commitImportReview, inspectImportFile, inspectImportText, reviewImportWorkbook, summarizeImportReview, type ImportWorkbook } from './importPipeline';
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

  it('combines one-player-per-row registrations by team identifier and normalizes division aliases', () => {
    const review = inspectImportText([
      'Team,Player,Division,Paid?',
      'T1,Ruby Hayes,Beg/Int,yes',
      'T1,Theo Martinez,Beginner-Intermediate,yes',
      'T2,Paige Sullivan,B/I,yes',
      'T2,Leo Murphy,Beg/Int,yes',
      'T3,Hannah Lewis,W 3.5,yes',
      'T3,Brooke Adams,Womens 3.5,yes'
    ].join('\n'), [], []);

    expect(review.rows.map((row) => [row.division, row.team, row.included])).toEqual([
      ['Beginner/Intermediate', 'Ruby Hayes / Theo Martinez', true],
      ['Beginner/Intermediate', 'Paige Sullivan / Leo Murphy', true],
      ["Women's 3.5", 'Hannah Lewis / Brooke Adams', true]
    ]);
    expect(summarizeImportReview(review, []).newDivisions).toEqual(['Beginner/Intermediate', "Women's 3.5"]);
  });

  it('handles local section headers, horizontal division blocks, metadata, and ignored sheets', () => {
    const review = reviewImportWorkbook(workbook([
      { name: 'Sign ups', rows: [
        ['Tournament team sign ups'],
        ['Beginner'],
        ['#', 'Name', 'Partner', 'Paid'],
        ['1', 'Maya Bennett', 'Lucas Harper', 'x'],
        ['2', 'Nina Patel', 'Owen Brooks', 'x'],
        ['Advanced — notes about the division'],
        ['Alex Morgan', 'Sam Rivera']
      ] },
      { name: 'Roster', rows: [
        ['Beginner', '', '', 'Beginner/Intermediate', '', '', 'Mixed 4.0', ''],
        ['Player 1', 'Player 2', '', 'Player 1', 'Player 2', '', 'Player 1', 'Player 2'],
        ['Maya Bennett', 'Lucas Harper', '', 'Ruby Hayes', 'Theo Martinez', '', 'Ana María Santos', 'Michael Chen']
      ] },
      { name: 'Notes', rows: [['Notes'], ['Do not import this row']] }
    ]), [], []);

    expect(review.rows.filter((row) => row.included).map((row) => `${row.division}:${row.team}`)).toEqual([
      'Beginner:Maya Bennett / Lucas Harper',
      'Beginner:Nina Patel / Owen Brooks',
      'Advanced:Alex Morgan / Sam Rivera',
      'Beginner/Intermediate:Ruby Hayes / Theo Martinez',
      'Mixed 4.0:Ana María Santos / Michael Chen'
    ]);
    expect(review.mappings.find((mapping) => mapping.sheet === 'Notes')).toMatchObject({ selected: false, layout: 'Ignored sheet', foundRows: 0 });
    expect(review.ignoredSheets.map((item) => item.sheet)).toContain('Notes');
  });

  it('normalizes messy partner separators, ignores metadata, and flags duplicate teams', () => {
    const review = reviewImportWorkbook(workbook([{ name: 'FINAL list', rows: [
      ['Division-ish', 'Team / Players', 'Fee', 'Contact', 'Status'],
      ['beg', 'Maya Bennett + Lucas Harper', '$40', 'maya@example.com', 'PAID'],
      ['Beginner', 'Nina Patel and Owen Brooks', '40', '207-555-0100', 'paid'],
      ['beginer', 'Maya Bennett / Lucas Harper', '$40', '', 'paid']
    ] }]), [], []);

    expect(review.rows.map((row) => ({ division: row.division, team: row.team, included: row.included, duplicate: row.duplicate }))).toEqual([
      { division: 'Beginner', team: 'Maya Bennett / Lucas Harper', included: true, duplicate: undefined },
      { division: 'Beginner', team: 'Nina Patel / Owen Brooks', included: true, duplicate: undefined },
      { division: 'Beginner', team: 'Maya Bennett / Lucas Harper', included: false, duplicate: 'source' }
    ]);
  });
});
