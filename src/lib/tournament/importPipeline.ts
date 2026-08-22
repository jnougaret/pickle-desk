import { parseCsvRecords, type CsvParseError } from './csv';
import type { Division, Team } from './types';
import { DEFAULT_DIVISION_SETTINGS, startTimeForEventDate } from './defaults';
import { newId } from './id';

export const IMPORT_LIMITS = {
  fileBytes: 10 * 1024 * 1024,
  sheets: 24,
  rowsPerSheet: 5_000,
  cells: 100_000
} as const;

export type ImportConfidence = 'high' | 'medium' | 'low';

export interface ImportSheet {
  name: string;
  rows: string[][];
  rowNumbers?: number[];
  hidden?: boolean;
}

export interface ImportWorkbook {
  sourceName: string;
  sheets: ImportSheet[];
}

export interface ImportSource {
  sheet: string;
  row: number;
  columns: number[];
}

export interface CanonicalImportRow {
  id: string;
  division: string;
  team: string;
  source: ImportSource;
  confidence: ImportConfidence;
  reasons: string[];
  warnings: string[];
  included: boolean;
  duplicate?: 'source' | 'existing';
}

export interface IgnoredImportRow {
  source: ImportSource;
  preview: string;
  reason: string;
}

export interface SheetMapping {
  sheet: string;
  selected: boolean;
  layout: string;
  headerRow?: number;
  divisionColumn?: number;
  teamColumn?: number;
  participantColumns: number[];
  ignoredColumns: { column: number; header: string; reason: string }[];
  foundRows: number;
  reason?: string;
}

export interface ImportReview {
  sourceName: string;
  rows: CanonicalImportRow[];
  ignoredRows: IgnoredImportRow[];
  mappings: SheetMapping[];
  newDivisions: string[];
  ignoredSheets: { sheet: string; reason: string }[];
  warnings: string[];
  errors: string[];
}

export interface ImportSummary {
  ready: number;
  warningRows: number;
  duplicates: number;
  unresolved: number;
  ignored: number;
  newDivisions: string[];
}

export interface WorkbookReader {
  read(file: File): Promise<ImportWorkbook>;
}

const DIVISION_HEADERS = /^(division|class|category|bracket|event|draw|flight|group)$/i;
const TEAM_HEADERS = /^(team|team name|teamname|pair|pair name|entry|entry name)$/i;
const PARTICIPANT_HEADERS = /^(player|player\s*(?:one|two|[a-z]|\d+)|participant|participant\s*(?:one|two|[a-z]|\d+)|partner|name|name\s*(?:one|two|[a-z]|\d+))$/i;
const IGNORED_HEADERS = /(email|e-mail|phone|mobile|payment|paid|timestamp|rating|seed|note|comment|status|amount|address|city|state|zip|postal|birth|date|time)/i;
const IGNORED_SHEET_NAMES = /(instruction|readme|cover|payment|invoice|score|result|schedule|contact|email|phone)/i;
const TOTAL_OR_NOTE = /^(total|subtotal|grand total|notes?|instructions?|do not edit|registration information|payment information)/i;

function textValue(value: unknown): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headerValue(value: string): string {
  return textValue(value).replace(/[’‘`´]/g, "'").replace(/[_-]+/g, ' ');
}

export function normalizeImportLabel(value: string): string {
  return headerValue(value)
    .toLocaleLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => ({ mens: 'men', womens: 'women', ladies: 'women' }[token] ?? token))
    .sort()
    .join(' ');
}

function normalizeTeamName(value: string): string {
  return headerValue(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function isDivisionLike(value: string): boolean {
  const normalized = headerValue(value);
  return /\b(?:mixed|men|mens|women|womens|open|singles|doubles|novice|advanced|recreational|senior|junior)\b/i.test(normalized)
    || /\b\d(?:\.\d)?\b/.test(normalized);
}

function isIgnoredRow(value: string): boolean {
  return TOTAL_OR_NOTE.test(value) || /^https?:\/\//i.test(value) || /@/.test(value);
}

function roleForHeader(value: string): 'division' | 'team' | 'participant' | 'ignored' | null {
  const normalized = headerValue(value);
  if (!normalized) return null;
  if (DIVISION_HEADERS.test(normalized)) return 'division';
  if (TEAM_HEADERS.test(normalized)) return 'team';
  if (PARTICIPANT_HEADERS.test(normalized)) return 'participant';
  if (IGNORED_HEADERS.test(normalized)) return 'ignored';
  return null;
}

function rowNumber(sheet: ImportSheet, index: number): number {
  return sheet.rowNumbers?.[index] ?? index + 1;
}

function nonEmptyCells(row: string[]): { value: string; column: number }[] {
  return row.map((value, column) => ({ value: textValue(value), column })).filter(({ value }) => Boolean(value));
}

function rowPreview(row: string[]): string {
  return nonEmptyCells(row).map(({ value }) => value).join(' · ').slice(0, 180);
}

function rowHasHeaderShape(row: string[]): boolean {
  return row.some((value) => roleForHeader(value) !== null);
}

function looksLikeRepeatedHeader(row: string[]): boolean {
  const roles = row.map(roleForHeader).filter(Boolean);
  return roles.length >= 2 || (roles.length === 1 && rowHasHeaderShape(row));
}

function isSheetDivisionCandidate(name: string, divisions: Division[]): boolean {
  return isDivisionLike(name) || divisions.some((division) => normalizeImportLabel(division.name) === normalizeImportLabel(name));
}

function teamFromCells(row: string[], columns?: number[]): { team: string; sourceColumns: number[]; joined: boolean } {
  const selected = (columns ?? row.map((_, index) => index))
    .map((column) => ({ value: textValue(row[column]), column }))
    .filter(({ value }) => Boolean(value) && !isIgnoredRow(value));
  return {
    team: selected.map(({ value }) => value).join(' / '),
    sourceColumns: selected.map(({ column }) => column + 1),
    joined: selected.length > 1
  };
}

interface HeaderAnalysis {
  index: number;
  roles: Map<number, 'division' | 'team' | 'participant' | 'ignored'>;
  score: number;
}

function findHeader(sheet: ImportSheet): HeaderAnalysis | null {
  let best: HeaderAnalysis | null = null;
  const scanLimit = Math.min(sheet.rows.length, 20);
  for (let index = 0; index < scanLimit; index += 1) {
    const roles = new Map<number, 'division' | 'team' | 'participant' | 'ignored'>();
    for (const [column, value] of sheet.rows[index].entries()) {
      const role = roleForHeader(value);
      if (role) roles.set(column, role);
    }
    const hasTeam = [...roles.values()].includes('team');
    const participantCount = [...roles.values()].filter((role) => role === 'participant').length;
    const hasDivision = [...roles.values()].includes('division');
    if ((!hasTeam && participantCount === 0) || (!hasDivision && !hasTeam && participantCount < 1)) continue;
    const score = (hasDivision ? 5 : 0) + (hasTeam ? 5 : 0) + participantCount * 2 + [...roles.values()].filter((role) => role === 'ignored').length;
    if (!best || score > best.score) best = { index, roles, score };
  }
  return best;
}

function findDivisionHeader(sheet: ImportSheet): { index: number; columns: number[] } | null {
  const scanLimit = Math.min(sheet.rows.length - 1, 15);
  let best: { index: number; columns: number[] } | null = null;
  for (let index = 0; index <= scanLimit; index += 1) {
    const columns = sheet.rows[index]
      .map((value, column) => roleForHeader(value) ? -1 : isDivisionLike(textValue(value)) ? column : -1)
      .filter((column) => column >= 0)
      .filter((column) => sheet.rows.slice(index + 1, index + 4).some((row) => Boolean(textValue(row[column]))));
    if (columns.length >= 2 && (!best || columns.length > best.columns.length)) best = { index, columns };
  }
  return best;
}

function candidateDivisionName(value: string, sheet: ImportSheet, divisions: Division[]): { value: string; reason: string } | null {
  const explicit = textValue(value);
  if (explicit) return { value: explicit, reason: 'Read the division from a column or section label.' };
  if (isSheetDivisionCandidate(sheet.name, divisions)) return { value: sheet.name, reason: 'Used the sheet name as the division.' };
  return null;
}

function addIgnored(ignoredRows: IgnoredImportRow[], sheet: ImportSheet, index: number, columns: number[], reason: string): void {
  ignoredRows.push({ source: { sheet: sheet.name, row: rowNumber(sheet, index), columns }, preview: rowPreview(sheet.rows[index]), reason });
}

function createRow(
  sheet: ImportSheet,
  index: number,
  columns: number[],
  division: string,
  team: string,
  confidence: ImportConfidence,
  reasons: string[],
  warnings: string[],
  selected: boolean
): CanonicalImportRow {
  const source = { sheet: sheet.name, row: rowNumber(sheet, index), columns };
  return {
    id: `${sheet.name}:${source.row}:${columns.join('-')}`,
    division,
    team,
    source,
    confidence,
    reasons,
    warnings,
    included: selected && Boolean(division && team) && confidence !== 'low'
  };
}

function buildStandardRows(
  sheet: ImportSheet,
  header: HeaderAnalysis,
  divisions: Division[],
  selected: boolean,
  ignoredRows: IgnoredImportRow[]
): { rows: CanonicalImportRow[]; mapping: SheetMapping } {
  const divisionColumn = [...header.roles.entries()].find(([, role]) => role === 'division')?.[0];
  const teamColumn = [...header.roles.entries()].find(([, role]) => role === 'team')?.[0];
  const participantColumns = [...header.roles.entries()].filter(([, role]) => role === 'participant').map(([column]) => column);
  const ignoredColumns = [...header.roles.entries()]
    .filter(([, role]) => role === 'ignored')
    .map(([column]) => ({ column: column + 1, header: textValue(sheet.rows[header.index][column]), reason: 'Contact, payment, rating, or other metadata is not imported.' }));
  const mapping: SheetMapping = {
    sheet: sheet.name,
    selected,
    layout: 'Header row',
    headerRow: rowNumber(sheet, header.index),
    divisionColumn: divisionColumn === undefined ? undefined : divisionColumn + 1,
    teamColumn: teamColumn === undefined ? undefined : teamColumn + 1,
    participantColumns: participantColumns.map((column) => column + 1),
    ignoredColumns,
    foundRows: 0
  };
  const rows: CanonicalImportRow[] = [];
  let previousDivision = '';
  for (let index = 0; index < header.index; index += 1) {
    const cells = nonEmptyCells(sheet.rows[index]);
    if (cells.length) addIgnored(ignoredRows, sheet, index, cells.map(({ column }) => column + 1), 'Title or preamble row.');
  }
  for (let index = header.index + 1; index < sheet.rows.length; index += 1) {
    const sourceCells = nonEmptyCells(sheet.rows[index]);
    if (!sourceCells.length) continue;
    if (looksLikeRepeatedHeader(sheet.rows[index])) { addIgnored(ignoredRows, sheet, index, sourceCells.map(({ column }) => column + 1), 'Repeated header row.'); continue; }
    if (isIgnoredRow(sourceCells[0].value)) { addIgnored(ignoredRows, sheet, index, sourceCells.map(({ column }) => column + 1), 'Instruction, contact, or total row.'); continue; }
    const explicitDivision = divisionColumn === undefined ? '' : textValue(sheet.rows[index][divisionColumn]);
    if (explicitDivision) previousDivision = explicitDivision;
    const division = candidateDivisionName(explicitDivision || previousDivision, sheet, divisions);
    const teamData = teamColumn !== undefined
      ? teamFromCells(sheet.rows[index], [teamColumn])
      : teamFromCells(sheet.rows[index], participantColumns.length ? participantColumns : undefined);
    if (!teamData.team && !division) {
      addIgnored(ignoredRows, sheet, index, sourceCells.map(({ column }) => column + 1), 'No division or team value could be identified.');
      continue;
    }
    const reasons = [division?.reason ?? 'A division still needs to be selected.'];
    if (teamColumn !== undefined) reasons.push('Used the explicit team column.');
    else if (participantColumns.length === 1) reasons.push('Used the participant/name column as the team name.');
    else if (teamData.joined) reasons.push('Joined participant columns with “ / ”.');
    const warnings = [...(selected ? [] : ['This sheet is not selected for import.'])];
    if (!division) warnings.push('Choose a division before importing this row.');
    if (!teamData.team) warnings.push('Choose or enter a team name before importing this row.');
    const confidence: ImportConfidence = division && teamData.team
      ? divisionColumn !== undefined && (teamColumn !== undefined || participantColumns.length > 0) ? 'high' : 'medium'
      : 'low';
    rows.push(createRow(sheet, index, teamData.sourceColumns, division?.value ?? '', teamData.team, confidence, reasons, warnings, selected));
    mapping.foundRows += 1;
  }
  return { rows, mapping };
}

function buildDivisionColumnRows(
  sheet: ImportSheet,
  divisionHeader: { index: number; columns: number[] },
  selected: boolean,
  ignoredRows: IgnoredImportRow[]
): { rows: CanonicalImportRow[]; mapping: SheetMapping } {
  const rows: CanonicalImportRow[] = [];
  const headers = sheet.rows[divisionHeader.index];
  const mapping: SheetMapping = {
    sheet: sheet.name,
    selected,
    layout: 'Division names as column headers',
    headerRow: rowNumber(sheet, divisionHeader.index),
    participantColumns: [],
    ignoredColumns: [],
    foundRows: 0
  };
  for (let index = 0; index < divisionHeader.index; index += 1) {
    const cells = nonEmptyCells(sheet.rows[index]);
    if (cells.length) addIgnored(ignoredRows, sheet, index, cells.map(({ column }) => column + 1), 'Title or preamble row.');
  }
  for (let index = divisionHeader.index + 1; index < sheet.rows.length; index += 1) {
    const row = sheet.rows[index];
    if (!nonEmptyCells(row).length) continue;
    for (const column of divisionHeader.columns) {
      const team = textValue(row[column]);
      if (!team) continue;
      if (isIgnoredRow(team)) { addIgnored(ignoredRows, sheet, index, [column + 1], 'Instruction or total cell.'); continue; }
      rows.push(createRow(sheet, index, [column + 1], textValue(headers[column]), team, 'high', ['Used the division name from the column header.'], selected ? [] : ['This sheet is not selected for import.'], selected));
      mapping.foundRows += 1;
    }
  }
  return { rows, mapping };
}

function buildSectionRows(
  sheet: ImportSheet,
  divisions: Division[],
  selected: boolean,
  ignoredRows: IgnoredImportRow[]
): { rows: CanonicalImportRow[]; mapping: SheetMapping } {
  const rows: CanonicalImportRow[] = [];
  const usableColumn = sheet.rows.reduce((best, row) => {
    const counts = row.map((value, column) => textValue(value) ? { column, count: 1 } : null).filter(Boolean) as { column: number; count: number }[];
    return counts.length > best.count ? { column: counts[0].column, count: counts.length } : best;
  }, { column: 0, count: 0 }).column;
  const sheetDivision = isSheetDivisionCandidate(sheet.name, divisions) ? sheet.name : '';
  let currentDivision = sheetDivision;
  let markerIndex = -1;
  const mapping: SheetMapping = {
    sheet: sheet.name,
    selected,
    layout: sheetDivision ? 'Teams with sheet-name division' : 'Division sections',
    participantColumns: [],
    ignoredColumns: [],
    foundRows: 0
  };
  for (let index = 0; index < sheet.rows.length; index += 1) {
    const cells = nonEmptyCells(sheet.rows[index]);
    if (!cells.length) continue;
    const value = textValue(sheet.rows[index][usableColumn]) || cells[0].value;
    if (looksLikeRepeatedHeader(sheet.rows[index])) { addIgnored(ignoredRows, sheet, index, cells.map(({ column }) => column + 1), 'Header or instruction row.'); continue; }
    if (isIgnoredRow(value)) { addIgnored(ignoredRows, sheet, index, [usableColumn + 1], 'Instruction, contact, or total row.'); continue; }
    const hasSupportingTeam = sheet.rows.slice(index + 1, index + 4).some((next) => {
      const nextValue = textValue(next[usableColumn]) || nonEmptyCells(next)[0]?.value || '';
      return Boolean(nextValue) && !isDivisionLike(nextValue) && !isIgnoredRow(nextValue);
    });
    const isMarker = Boolean(value) && (isDivisionLike(value) || divisions.some((division) => normalizeImportLabel(division.name) === normalizeImportLabel(value))) && hasSupportingTeam;
    if (isMarker) {
      currentDivision = value;
      markerIndex = index;
      continue;
    }
    if (index === markerIndex) continue;
    const teamData = teamFromCells(sheet.rows[index]);
    if (!teamData.team) continue;
    const division = currentDivision;
    const warnings = [...(selected ? [] : ['This sheet is not selected for import.'])];
    if (!division) warnings.push('Choose a division before importing this row.');
    const reasons = division === sheetDivision
      ? ['Used the sheet name as the division.']
      : ['Used the most recent division section marker.'];
    if (teamData.joined) reasons.push('Joined adjacent values with “ / ”.');
    const confidence: ImportConfidence = division ? (isDivisionLike(division) ? 'high' : 'medium') : 'low';
    rows.push(createRow(sheet, index, teamData.sourceColumns, division, teamData.team, confidence, reasons, warnings, selected));
    mapping.foundRows += 1;
  }
  return { rows, mapping };
}

function inferSheet(sheet: ImportSheet, divisions: Division[], ignoredRows: IgnoredImportRow[]): { rows: CanonicalImportRow[]; mapping: SheetMapping; ignored?: { sheet: string; reason: string } } {
  const ignoredByName = IGNORED_SHEET_NAMES.test(sheet.name);
  const selected = !sheet.hidden && !ignoredByName;
  if (!sheet.rows.length) {
    const mapping: SheetMapping = { sheet: sheet.name, selected: false, layout: 'Empty sheet', participantColumns: [], ignoredColumns: [], foundRows: 0, reason: 'The sheet has no values.' };
    return { rows: [], mapping, ignored: { sheet: sheet.name, reason: mapping.reason! } };
  }
  const headerCandidate = findHeader(sheet);
  const header = headerCandidate && (
    [...headerCandidate.roles.values()].includes('division')
    || [...headerCandidate.roles.values()].includes('team')
    || isSheetDivisionCandidate(sheet.name, divisions)
  ) ? headerCandidate : null;
  const divisionHeader = header ? null : findDivisionHeader(sheet);
  let result: { rows: CanonicalImportRow[]; mapping: SheetMapping };
  if (header) result = buildStandardRows(sheet, header, divisions, selected, ignoredRows);
  else if (divisionHeader) result = buildDivisionColumnRows(sheet, divisionHeader, selected, ignoredRows);
  else result = buildSectionRows(sheet, divisions, selected, ignoredRows);
  result.mapping.selected = selected && result.mapping.foundRows > 0;
  if (!result.mapping.foundRows) {
    result.mapping.reason = ignoredByName ? 'The sheet name suggests instructions, scores, or contact data.' : 'No team-like rows were found.';
    return { ...result, ignored: { sheet: sheet.name, reason: result.mapping.reason } };
  }
  if (!result.mapping.selected) {
    result.mapping.reason = sheet.hidden ? 'Hidden sheets are not selected by default.' : 'This sheet is not selected by default.';
    return { ...result, ignored: { sheet: sheet.name, reason: result.mapping.reason } };
  }
  return result;
}

function reconcileRows(rows: CanonicalImportRow[], divisions: Division[], teams: Team[]): { rows: CanonicalImportRow[]; newDivisions: string[] } {
  const divisionByKey = new Map(divisions.map((division) => [normalizeImportLabel(division.name), division.name]));
  const newDivisions = new Set<string>();
  const seen = new Set<string>();
  const existing = new Set(teams.map((team) => {
    const division = divisions.find((item) => item.id === team.divisionId);
    return `${normalizeImportLabel(division?.name ?? '')}|${normalizeTeamName(team.name)}`;
  }));
  const reconciled = rows.map((row) => {
    const next = { ...row, reasons: [...row.reasons], warnings: [...row.warnings] };
    if (next.division) {
      const matched = divisionByKey.get(normalizeImportLabel(next.division));
      if (matched) {
        next.division = matched;
        next.reasons.push('Matched an existing division after normalizing case, punctuation, and word order.');
      } else newDivisions.add(next.division);
    }
    if (next.division && next.team) {
      const key = `${normalizeImportLabel(next.division)}|${normalizeTeamName(next.team)}`;
      if (existing.has(key)) {
        next.duplicate = 'existing';
        next.included = false;
        next.warnings.push('This team already exists in the tournament. Choose Include anyway only if this is intentional.');
      } else if (seen.has(key)) {
        next.duplicate = 'source';
        next.included = false;
        next.warnings.push('This team appears more than once in the selected source rows.');
      } else if (next.included) seen.add(key);
    }
    return next;
  });
  return { rows: reconciled, newDivisions: [...newDivisions] };
}

function validateLimits(workbook: ImportWorkbook): string[] {
  const errors: string[] = [];
  if (workbook.sheets.length > IMPORT_LIMITS.sheets) errors.push(`This workbook has ${workbook.sheets.length} sheets; Pickle Desk supports up to ${IMPORT_LIMITS.sheets}.`);
  let cells = 0;
  for (const sheet of workbook.sheets) {
    if (sheet.rows.length > IMPORT_LIMITS.rowsPerSheet) errors.push(`${sheet.name} has more than ${IMPORT_LIMITS.rowsPerSheet} rows.`);
    cells += sheet.rows.reduce((total, row) => total + row.length, 0);
  }
  if (cells > IMPORT_LIMITS.cells) errors.push(`This workbook has more than ${IMPORT_LIMITS.cells.toLocaleString()} cells.`);
  return errors;
}

export function reviewImportWorkbook(workbook: ImportWorkbook, divisions: Division[], teams: Team[]): ImportReview {
  const ignoredRows: IgnoredImportRow[] = [];
  const inferred = workbook.sheets.map((sheet) => inferSheet(sheet, divisions, ignoredRows));
  const reconciled = reconcileRows(inferred.flatMap(({ rows }) => rows), divisions, teams);
  const ignoredSheets = inferred.map(({ ignored }) => ignored).filter(Boolean) as { sheet: string; reason: string }[];
  const warnings: string[] = [];
  if (ignoredRows.length) warnings.push(`${ignoredRows.length} row(s) were ignored because they look like headers, notes, totals, or unrelated data.`);
  const unresolved = reconciled.rows.filter((row) => row.included && (!row.division || !row.team));
  if (unresolved.length) warnings.push(`${unresolved.length} row(s) need a division or team name before import.`);
  if (!reconciled.rows.some((row) => row.included && row.division && row.team)) warnings.push('No rows are ready to import yet. Select a sheet or resolve the flagged rows.');
  return {
    sourceName: workbook.sourceName,
    rows: reconciled.rows,
    ignoredRows,
    mappings: inferred.map(({ mapping }) => mapping),
    newDivisions: reconciled.newDivisions,
    ignoredSheets,
    warnings,
    errors: validateLimits(workbook)
  };
}

export function parseCsvWorkbook(csv: string, sourceName = 'pasted.csv'): ImportWorkbook {
  const firstLine = csv.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  const delimiter = !firstLine.includes(',') && firstLine.includes('\t') ? '\t' : ',';
  const records = parseCsvRecords(csv, delimiter);
  return { sourceName, sheets: [{ name: sourceName, rows: records.map(({ fields }) => fields), rowNumbers: records.map(({ line }) => line) }] };
}

export function inspectImportText(csv: string, divisions: Division[], teams: Team[], sourceName = 'pasted.csv'): ImportReview {
  try {
    return reviewImportWorkbook(parseCsvWorkbook(csv, sourceName), divisions, teams);
  } catch (error) {
    const line = (error as CsvParseError)?.line;
    return { sourceName, rows: [], ignoredRows: [], mappings: [], newDivisions: [], ignoredSheets: [], warnings: [], errors: [line ? `Line ${line}: ${(error as Error).message}` : 'CSV could not be parsed.'] };
  }
}

async function readSpreadsheetFile(file: File): Promise<ImportWorkbook> {
  const XLSX = await import('@e965/xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: false, cellHTML: false, cellNF: false, cellStyles: false, bookVBA: false, WTF: false });
  const sheets: ImportSheet[] = workbook.SheetNames.map((name: string) => {
    const sheet = workbook.Sheets[name] as Record<string, unknown>;
    const range = typeof sheet['!ref'] === 'string' ? XLSX.utils.decode_range(sheet['!ref'] as string) : { s: { r: 0, c: 0 }, e: { r: -1, c: -1 } };
    const rows: string[][] = [];
    const rowNumbers: number[] = [];
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      const values: string[] = [];
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })] as { w?: unknown; v?: unknown } | undefined;
        values.push(textValue(cell?.w ?? cell?.v ?? ''));
      }
      rows.push(values);
      rowNumbers.push(row + 1);
    }
    const metadata = (workbook.Workbook?.Sheets ?? []).find((item: { name?: string }) => item.name === name) as { Hidden?: number } | undefined;
    return { name, rows, rowNumbers, hidden: metadata?.Hidden === 1 || metadata?.Hidden === 2 };
  });
  return { sourceName: file.name, sheets };
}

export async function inspectImportFile(file: File, divisions: Division[], teams: Team[]): Promise<ImportReview> {
  if (file.size > IMPORT_LIMITS.fileBytes) {
    return { sourceName: file.name, rows: [], ignoredRows: [], mappings: [], newDivisions: [], ignoredSheets: [], warnings: [], errors: [`This file is larger than ${Math.round(IMPORT_LIMITS.fileBytes / 1024 / 1024)} MB. Choose a smaller workbook or paste only the registration rows.`] };
  }
  const lowerName = file.name.toLocaleLowerCase();
  if (lowerName.endsWith('.csv') || file.type === 'text/csv') return inspectImportText(await file.text(), divisions, teams, file.name);
  if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
    return { sourceName: file.name, rows: [], ignoredRows: [], mappings: [], newDivisions: [], ignoredSheets: [], warnings: [], errors: ['Choose a CSV, XLSX, or XLS file.'] };
  }
  try {
    return reviewImportWorkbook(await readSpreadsheetFile(file), divisions, teams);
  } catch (error) {
    return { sourceName: file.name, rows: [], ignoredRows: [], mappings: [], newDivisions: [], ignoredSheets: [], warnings: [], errors: [error instanceof Error ? `Could not read this workbook: ${error.message}` : 'Could not read this workbook.'] };
  }
}

export function summarizeImportReview(review: ImportReview, divisions: Division[]): ImportSummary {
  const known = new Set(divisions.map((division) => normalizeImportLabel(division.name)));
  const newDivisions = [...new Set(review.rows.filter((row) => row.included && row.division).map((row) => row.division.trim()).filter((name) => !known.has(normalizeImportLabel(name))))];
  return {
    ready: review.rows.filter((row) => row.included && row.division.trim() && row.team.trim()).length,
    warningRows: review.rows.filter((row) => row.warnings.length > 0).length,
    duplicates: review.rows.filter((row) => Boolean(row.duplicate)).length,
    unresolved: review.rows.filter((row) => row.included && (!row.division.trim() || !row.team.trim())).length,
    ignored: review.ignoredRows.length + review.rows.filter((row) => !row.included).length,
    newDivisions
  };
}

export function commitImportReview(review: ImportReview, divisions: Division[], teams: Team[], tournamentId: string, eventDate?: string): { divisions: Division[]; teams: Team[] } {
  if (review.errors.length) throw new Error(review.errors[0]);
  const included = review.rows.filter((row) => row.included);
  if (!included.length) throw new Error('Select at least one ready row to import.');
  if (included.some((row) => !row.division.trim() || !row.team.trim())) throw new Error('Resolve the division and team name on each selected row before importing.');
  const resultDivisions = [...divisions];
  for (const name of [...new Set(included.map((row) => row.division.trim()))]) {
    if (!resultDivisions.some((division) => normalizeImportLabel(division.name) === normalizeImportLabel(name))) {
      resultDivisions.push({ id: newId('division'), tournamentId, name, startTime: startTimeForEventDate(eventDate ?? ''), ...DEFAULT_DIVISION_SETTINGS });
    }
  }
  const resultTeams = [...teams];
  const seen = new Set(resultTeams.map((team) => {
    const division = resultDivisions.find((item) => item.id === team.divisionId);
    return `${normalizeImportLabel(division?.name ?? '')}|${normalizeTeamName(team.name)}`;
  }));
  for (const row of included) {
    const division = resultDivisions.find((item) => normalizeImportLabel(item.name) === normalizeImportLabel(row.division));
    if (!division) throw new Error(`Could not resolve the division for source row ${row.source.row}.`);
    const key = `${normalizeImportLabel(division.name)}|${normalizeTeamName(row.team)}`;
    if (seen.has(key) && !row.duplicate) throw new Error(`Source row ${row.source.row} duplicates an existing team. Choose Include anyway if intentional.`);
    resultTeams.push({ id: newId('team'), divisionId: division.id, name: row.team.trim() });
    seen.add(key);
  }
  return { divisions: resultDivisions, teams: resultTeams };
}
