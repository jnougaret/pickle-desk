import type { Division, Team } from './types';
import { newId } from './id';
import { DEFAULT_DIVISION_SETTINGS, startTimeForEventDate } from './defaults';

export interface ImportPreview {
  rows: { line: number; division: string; team: string }[];
  errors: string[];
  newDivisions: string[];
}

export interface CsvRecord {
  fields: string[];
  line: number;
}

export class CsvParseError extends Error {
  constructor(public readonly line: number, message: string) {
    super(message);
  }
}

export function parseCsvRecords(csv: string, delimiter = ','): CsvRecord[] {
  const records: CsvRecord[] = [];
  const text = csv.replace(/^\uFEFF/, '');
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let afterQuote = false;
  let recordTouched = false;
  let line = 1;
  let recordLine = 1;

  const finishRecord = (): void => {
    if (recordTouched) records.push({ fields: [...fields, field.trim()], line: recordLine });
    fields = [];
    field = '';
    afterQuote = false;
    recordTouched = false;
  };

  const consumeLineBreak = (index: number): number => {
    if (text[index] === '\r' && text[index + 1] === '\n') return index + 2;
    return index + 1;
  };

  let index = 0;
  while (index < text.length) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
        } else {
          inQuotes = false;
          afterQuote = true;
          index += 1;
        }
        continue;
      }
      if (character === '\r' || character === '\n') {
        field += character === '\r' && text[index + 1] === '\n' ? '\n' : character;
        if (character === '\r' && text[index + 1] === '\n') index += 1;
        line += 1;
        index += 1;
        continue;
      }
      field += character;
      index += 1;
      continue;
    }

    if (afterQuote) {
      if (character === ' ' || character === '\t') {
        index += 1;
        continue;
      }
      if (character === delimiter) {
        fields.push(field.trim());
        field = '';
        afterQuote = false;
        recordTouched = true;
        index += 1;
        continue;
      }
      if (character === '\r' || character === '\n') {
        finishRecord();
        index = consumeLineBreak(index);
        line += 1;
        recordLine = line;
        continue;
      }
      throw new CsvParseError(line, 'unexpected characters after a quoted field.');
    }

    if (character === '"') {
      if (field.trim()) throw new CsvParseError(line, 'a quoted field must begin at the start of a field.');
      inQuotes = true;
      recordTouched = true;
      index += 1;
      continue;
    }
    if (character === delimiter) {
      fields.push(field.trim());
      field = '';
      recordTouched = true;
      index += 1;
      continue;
    }
    if (character === '\r' || character === '\n') {
      finishRecord();
      index = consumeLineBreak(index);
      line += 1;
      recordLine = line;
      continue;
    }
    if (!/\s/.test(character)) recordTouched = true;
    field += character;
    index += 1;
  }

  if (inQuotes) throw new CsvParseError(recordLine, 'unterminated quoted field.');
  if (recordTouched || fields.length > 0) {
    records.push({ fields: [...fields, field.trim()], line: recordLine });
  }
  return records;
}

export function previewCsv(csv: string, divisions: Division[]): ImportPreview {
  const rows: ImportPreview['rows'] = [];
  const errors: string[] = [];
  const known = new Set(divisions.map((division) => division.name.trim().toLowerCase()));
  const newDivisions = new Set<string>();
  let records: CsvRecord[];
  try {
    records = parseCsvRecords(csv);
  } catch (error) {
    if (error instanceof CsvParseError) errors.push(`Line ${error.line}: ${error.message}`);
    else errors.push('CSV could not be parsed.');
    return { rows, errors, newDivisions: [...newDivisions] };
  }

  records.forEach((record, index) => {
    const parts = record.fields;
    if (index === 0 && parts[0]?.toLowerCase() === 'division' && parts[1]?.toLowerCase() === 'team') return;
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      errors.push(`Line ${record.line}: expected division,team.`); return;
    }
    rows.push({ line: record.line, division: parts[0], team: parts[1] });
    if (!known.has(parts[0].toLowerCase())) { known.add(parts[0].toLowerCase()); newDivisions.add(parts[0]); }
  });
  return { rows, errors, newDivisions: [...newDivisions] };
}

export function commitCsv(preview: ImportPreview, divisions: Division[], teams: Team[], tournamentId: string, eventDate?: string): { divisions: Division[]; teams: Team[] } {
  const resultDivisions = [...divisions];
  const resultTeams = [...teams];
  for (const name of preview.newDivisions) {
    resultDivisions.push({ id: newId('division'), tournamentId, name, startTime: startTimeForEventDate(eventDate ?? ''), ...DEFAULT_DIVISION_SETTINGS });
  }
  for (const row of preview.rows) {
    const division = resultDivisions.find((item) => item.name.toLowerCase() === row.division.toLowerCase());
    if (division) resultTeams.push({ id: newId('team'), divisionId: division.id, name: row.team });
  }
  return { divisions: resultDivisions, teams: resultTeams };
}
