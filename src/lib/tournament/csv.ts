import type { Division, Team } from './types';
import { newId } from './id';
import { DEFAULT_DIVISION_SETTINGS, startTimeForEventDate } from './defaults';

export interface ImportPreview {
  rows: { line: number; division: string; team: string }[];
  errors: string[];
  newDivisions: string[];
}

export function previewCsv(csv: string, divisions: Division[]): ImportPreview {
  const rows: ImportPreview['rows'] = [];
  const errors: string[] = [];
  const known = new Set(divisions.map((division) => division.name.trim().toLowerCase()));
  const newDivisions = new Set<string>();
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const parts = line.split(',').map((part) => part.trim().replace(/^"|"$/g, ''));
    if (lineNumber === 1 && parts[0].toLowerCase() === 'division') return;
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      errors.push(`Line ${lineNumber}: expected division,team.`); return;
    }
    rows.push({ line: lineNumber, division: parts[0], team: parts[1] });
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
