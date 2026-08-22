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
  /** Internal grouping key used when a source does not provide division labels. */
  fallbackGroup?: string;
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

const DIVISION_HEADERS = /^(division|division\s*(?:name|ish|type)|class|category|category\s*name|bracket|event|event\s*division|draw|flight|group|level|skill\s*level)$/i;
const TEAM_HEADERS = /^(team|team\s*name|teamname|team\s*(?:entry|id|number|no|#|players?)|registration\s*(?:team|id|number|no|#)|pair|pair\s*name|pair\s*(?:id|number|no|#)|entry|entry\s*(?:name|id|number|no|#)|roster)$/i;
const PARTICIPANT_HEADERS = /^(?:(?:player|participant|partner|teammate|registrant|person|name)(?:\s*(?:one|two|[a-z]|\d+))?(?:\s+(?:first|last)(?:\s+name)?|\s+name)?|first\s*name|last\s*name|p\s*[12](?:\s+(?:first|last)(?:\s+name)?|\s+name)?)$/i;
const IGNORED_HEADERS = /(email|e-mail|phone|mobile|text|sms|payment|paid|fee|dupr|rating|skill|gender|sex|seed|note|comment|status|amount|address|city|state|zip|postal|birth|date|time|timestamp|waiver|shirt|emergency|contact|id|url|instagram|facebook)/i;
const IGNORED_SHEET_NAMES = /(instruction|readme|cover|payment|invoice|score|result|schedule|contact|email|phone|note|info)/i;
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

function normalizedHeader(value: string): string {
  return headerValue(value).toLocaleLowerCase().replace(/[\/+,]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function divisionDisplayValue(value: string): string {
  return textValue(value).replace(/\s*[—–]\s*.*$/, '').trim();
}

export function normalizeImportLabel(value: string): string {
  const raw = divisionDisplayValue(value).toLocaleLowerCase().replace(/[’‘`´']/g, '');
  const rawTokens: string[] = raw.match(/[\p{L}]+|\d+(?:\.\d+)?/gu) ?? [];
  const hasShortMixed = rawTokens.includes('b') && rawTokens.includes('i');
  return rawTokens
    .map((token) => {
      if (hasShortMixed && (token === 'b' || token === 'i')) return null;
      if (/^\d+\.0+$/.test(token)) return String(Number(token));
      return ({
        mens: 'men',
        womens: 'women',
        ladies: 'women',
        w: 'women',
        m: 'men',
        mxd: 'mixed',
        mx: 'mixed',
        beg: 'beginner',
        beginer: 'beginner',
        int: 'intermediate'
      }[token] ?? token);
    })
    .filter((token): token is string => Boolean(token))
    .concat(hasShortMixed ? ['beginner', 'intermediate'] : [])
    .sort()
    .join(' ');
}

function normalizeTeamName(value: string): string {
  return headerValue(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function normalizeTeamValue(value: string): string {
  return textValue(value)
    .replace(/\s*(?:\/|\+|&|\band\b)\s*/gi, ' / ')
    .replace(/\s*,\s*/g, ' / ')
    .replace(/(?:\s*\/\s*)+/g, ' / ')
    .replace(/(?:\s*\/\s*)+$/g, '')
    .replace(/^(?:\s*\/\s*)+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDivisionLike(value: string): boolean {
  const normalized = headerValue(value);
  return /\b(?:beginner|intermediate|mixed|mxd|men|mens|women|womens|open|singles|doubles|novice|advanced|recreational|senior|junior)\b/i.test(normalized)
    || /(?:^|[\s/])(?:beg|int|b|i|m|w)(?:$|[\s/])/i.test(normalized)
    || /\b\d+\.\d+\b/.test(normalized);
}

function isDivisionSectionLabel(value: string): boolean {
  const clean = divisionDisplayValue(value);
  if (!clean || clean.length > 40) return false;
  if (/\b(?:tournament|registration|sign[- ]?ups?|recreational|export|roster)\b/i.test(clean)) return false;
  if (/^(?:group|section|wave|block|session|flight|pool|court)\s*[a-z0-9]/i.test(clean)) return false;
  return isDivisionLike(clean);
}

function isIgnoredRow(value: string): boolean {
  return TOTAL_OR_NOTE.test(value) || /\b(?:total|totals|subtotal|grand total)\b/i.test(value) || /^(?:note|notes|instruction|instructions)\s*:/i.test(value) || /^https?:\/\//i.test(value) || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(value);
}

function isHardIgnoredRow(value: string): boolean {
  return TOTAL_OR_NOTE.test(value)
    || /\b(?:total|totals|subtotal|grand total)\b/i.test(value)
    || /^(?:note|notes|instruction|instructions)\s*:/i.test(value)
    || /^(?:reminder|please|do not edit|payment total|paid status|phone list)\b/i.test(value)
    || /^(?:export|exported|generated|printed)\b/i.test(value)
    || /\b(?:maintained by the organizer|confirm waivers)\b/i.test(value);
}

function roleForHeader(value: string): 'division' | 'team' | 'participant' | 'ignored' | null {
  const normalized = normalizedHeader(value);
  if (!normalized) return null;
  if (DIVISION_HEADERS.test(normalized)) return 'division';
  if (TEAM_HEADERS.test(normalized) || /^team(?:\s+players)?$/i.test(normalized)) return 'team';
  if (PARTICIPANT_HEADERS.test(normalized)) return 'participant';
  if (IGNORED_HEADERS.test(normalized)) return 'ignored';
  return null;
}

function isTeamIdentifierHeader(value: string): boolean {
  const normalized = normalizedHeader(value);
  return /^(?:#|no|number|id|team\s*(?:id|number|no|#)|entry\s*(?:id|number|no|#)|registration\s*(?:id|number|no|#))$/i.test(normalized);
}

function isIdentifierValue(value: string): boolean {
  return /^(?:#?\d+|[a-z]{1,4}[-_ ]?\d+)$/i.test(textValue(value));
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

function fallbackGroupKey(sheet: ImportSheet, group: number): string {
  return `${sheet.name}::${group}`;
}

function likelyGroupMarker(value: string): boolean {
  const clean = textValue(value);
  if (!clean || isIgnoredRow(clean) || isIdentifierValue(clean) || isDivisionSectionLabel(clean)) return false;
  if (/[\/+,]|\band\b/i.test(clean)) return false;
  return /^(?:group|section|wave|block|session|flight|pool|court)\s*[a-z0-9]/i.test(clean)
    || /^(?:saturday|sunday|morning|afternoon|evening)\b/i.test(clean);
}

function looksLikeRepeatedHeader(row: string[]): boolean {
  const roles = row.map(roleForHeader).filter(Boolean);
  return roles.length >= 2 || (roles.length === 1 && roles[0] !== 'ignored');
}

function isSheetDivisionCandidate(name: string, divisions: Division[]): boolean {
  return isDivisionSectionLabel(name) || divisions.some((division) => normalizeImportLabel(division.name) === normalizeImportLabel(name));
}

function teamFromCells(row: string[], columns?: number[], groups?: number[][]): { team: string; sourceColumns: number[]; joined: boolean } {
  if (groups?.length) {
    const names = groups.map((group) => group
      .map((column) => textValue(row[column]))
      .filter((value) => Boolean(value) && !isIgnoredRow(value))
      .join(' '))
      .map(normalizeTeamValue)
      .filter(Boolean);
    return {
      team: normalizeTeamValue(names.join(' / ')),
      sourceColumns: groups.flat().filter((column) => Boolean(textValue(row[column]))).map((column) => column + 1),
      joined: names.length > 1
    };
  }
  const selected = (columns ?? row.map((_, index) => index))
    .map((column) => ({ value: textValue(row[column]), column }))
    .filter(({ value }) => Boolean(value) && !isIgnoredRow(value));
  return {
    team: normalizeTeamValue(selected.map(({ value }) => value).join(' / ')),
    sourceColumns: selected.map(({ column }) => column + 1),
    joined: selected.length > 1
  };
}

interface HeaderAnalysis {
  index: number;
  roles: Map<number, 'division' | 'team' | 'participant' | 'ignored'>;
  score: number;
}

function participantGroupKey(value: string): string | null {
  const normalized = normalizedHeader(value);
  if (/\b(?:p|player|participant|partner|teammate|person|name)\s*(?:one|1|a)\b/i.test(normalized) || /^p\s*1\b/i.test(normalized)) return '1';
  if (/\b(?:p|player|participant|partner|teammate|person|name)\s*(?:two|2|b)\b/i.test(normalized) || /^p\s*2\b/i.test(normalized)) return '2';
  if (/\b(?:first|last)\b/i.test(normalized)) return normalized.replace(/\b(?:first|last)\b/g, '').trim() || null;
  return null;
}

function participantGroups(sheet: ImportSheet, header: HeaderAnalysis, columns: number[]): number[][] {
  const groups = new Map<string, number[]>();
  let unnamedGroup = 0;
  for (const column of columns) {
    const key = participantGroupKey(sheet.rows[header.index][column]) ?? `column-${unnamedGroup++}`;
    const group = groups.get(key) ?? [];
    group.push(column);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function participantGroupsForHeaderRow(row: string[]): { roles: Map<number, 'division' | 'team' | 'participant' | 'ignored'>; groups: number[][] } {
  const roles = new Map<number, 'division' | 'team' | 'participant' | 'ignored'>();
  for (const [column, value] of row.entries()) {
    const role = roleForHeader(value);
    if (role) roles.set(column, role);
  }
  const columns = [...roles.entries()].filter(([, role]) => role === 'participant').map(([column]) => column);
  const groups = new Map<string, number[]>();
  let unnamedGroup = 0;
  for (const column of columns) {
    const key = participantGroupKey(row[column]) ?? `column-${unnamedGroup++}`;
    const group = groups.get(key) ?? [];
    group.push(column);
    groups.set(key, group);
  }
  return { roles, groups: [...groups.values()] };
}

function participantGroupsForColumns(row: string[], columns: number[]): number[][] {
  const groups = new Map<string, number[]>();
  for (const column of columns) {
    const key = participantGroupKey(row[column]) ?? `column-${column}`;
    const group = groups.get(key) ?? [];
    group.push(column);
    groups.set(key, group);
  }
  return [...groups.values()];
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
    const row = sheet.rows[index];
    const columns = row
      .map((value, column) => roleForHeader(value) ? -1 : isDivisionLike(textValue(value)) ? column : -1)
      .filter((column) => column >= 0)
      .filter((column) => sheet.rows.slice(index + 1, index + 4).some((row) => Boolean(textValue(row[column]))));
    if (columns.length >= 2 && nonEmptyCells(row).length <= columns.length + 1 && (!best || columns.length > best.columns.length)) best = { index, columns };
  }
  return best;
}

function candidateDivisionName(value: string, sheet: ImportSheet, divisions: Division[]): { value: string; reason: string } | null {
  const explicit = divisionDisplayValue(value);
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
  selected: boolean,
  fallbackGroup?: string
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
    included: selected && Boolean(division && team) && confidence !== 'low',
    fallbackGroup
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
  const participantColumnGroups = participantGroups(sheet, header, participantColumns);
  const dataRows = sheet.rows.slice(header.index + 1);
  const teamIdentifier = teamColumn !== undefined && participantColumns.length > 0 && (
    isTeamIdentifierHeader(sheet.rows[header.index][teamColumn])
    || dataRows.some((row) => isIdentifierValue(row[teamColumn]))
  );
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
  type ParsedRow = { index: number; division: string; team: string; teamId?: string; sourceColumns: number[]; joined: boolean; fallbackGroup: string };
  type GroupedRows = { index: number; division: string; teamId: string; names: string[]; sourceColumns: Set<number>; fallbackGroup: string };
  const parsedRows: ParsedRow[] = [];
  const groupedRows = new Map<string, GroupedRows>();
  let previousDivision = '';
  let sectionDivision = '';
  let fallbackGroupIndex = 0;
  let dataStarted = false;
  let previousSourceRow = 0;
  for (let index = 0; index < header.index; index += 1) {
    const cells = nonEmptyCells(sheet.rows[index]);
    if (cells.length === 1 && isDivisionSectionLabel(cells[0].value)) {
      sectionDivision = divisionDisplayValue(cells[0].value);
      fallbackGroupIndex += 1;
    }
    if (cells.length) addIgnored(ignoredRows, sheet, index, cells.map(({ column }) => column + 1), 'Title or preamble row.');
  }
  for (let index = header.index + 1; index < sheet.rows.length; index += 1) {
    const sourceCells = nonEmptyCells(sheet.rows[index]);
    if (!sourceCells.length) {
      if (dataStarted && divisionColumn === undefined) fallbackGroupIndex += 1;
      continue;
    }
    const sourceRow = rowNumber(sheet, index);
    if (dataStarted && divisionColumn === undefined && sourceRow > previousSourceRow + 1) {
      fallbackGroupIndex += 1;
    }
    if (looksLikeRepeatedHeader(sheet.rows[index])) {
      if (dataStarted && divisionColumn === undefined) fallbackGroupIndex += 1;
      addIgnored(ignoredRows, sheet, index, sourceCells.map(({ column }) => column + 1), 'Repeated header row.');
      previousSourceRow = sourceRow;
      continue;
    }
    const explicitDivision = divisionColumn === undefined ? '' : textValue(sheet.rows[index][divisionColumn]);
    if (explicitDivision) previousDivision = explicitDivision;
    const participantData = participantColumns.length
      ? teamFromCells(sheet.rows[index], undefined, participantColumnGroups)
      : { team: '', sourceColumns: [], joined: false };
    const teamData = teamColumn !== undefined && !teamIdentifier
      ? teamFromCells(sheet.rows[index], [teamColumn])
      : participantData.team
        ? participantData
        : teamColumn !== undefined ? teamFromCells(sheet.rows[index], [teamColumn]) : participantData;
    const markerValue = explicitDivision || (sourceCells.length === 1 ? sourceCells[0].value : '');
    const markerTeamData = sourceCells.length === 1 && (teamIdentifier || isDivisionSectionLabel(markerValue) || likelyGroupMarker(markerValue))
      ? { team: '', sourceColumns: [], joined: false }
      : teamData;
    const hasSupportingTeam = sheet.rows.slice(index + 1, index + 6).some((next) => {
      const nextSource = nonEmptyCells(next);
      if (!nextSource.length || looksLikeRepeatedHeader(next)) return false;
      const nextParticipants = participantColumns.length ? teamFromCells(next, undefined, participantColumnGroups).team : '';
      const nextTeam = teamColumn !== undefined && !teamIdentifier
        ? teamFromCells(next, [teamColumn]).team
        : nextParticipants || (teamColumn !== undefined ? teamFromCells(next, [teamColumn]).team : '');
      return Boolean(nextTeam) && !isIgnoredRow(nextSource[0].value);
    });
    const markerIsDivision = isDivisionSectionLabel(markerValue);
    if (!markerTeamData.team && sourceCells.length === 1 && hasSupportingTeam && (markerIsDivision || likelyGroupMarker(markerValue))) {
      fallbackGroupIndex += 1;
      sectionDivision = markerIsDivision ? divisionDisplayValue(markerValue) : '';
      addIgnored(ignoredRows, sheet, index, [sourceCells[0].column + 1], markerIsDivision ? 'Division section marker.' : 'Unlabeled group marker.');
      previousSourceRow = sourceRow;
      continue;
    }
    if (isHardIgnoredRow(sourceCells[0].value) || (isIgnoredRow(sourceCells[0].value) && !teamData.team)) { addIgnored(ignoredRows, sheet, index, sourceCells.map(({ column }) => column + 1), 'Instruction, contact, or total row.'); previousSourceRow = sourceRow; continue; }
    const division = candidateDivisionName(explicitDivision || previousDivision || sectionDivision, sheet, divisions);
    if (!teamData.team && !division) {
      addIgnored(ignoredRows, sheet, index, sourceCells.map(({ column }) => column + 1), 'No division or team value could be identified.');
      previousSourceRow = sourceRow;
      continue;
    }
    const fallbackGroup = fallbackGroupKey(sheet, fallbackGroupIndex);
    const parsed: ParsedRow = { index, division: division?.value ?? '', team: teamData.team, teamId: teamIdentifier ? textValue(sheet.rows[index][teamColumn!]) : undefined, sourceColumns: teamData.sourceColumns, joined: teamData.joined, fallbackGroup };
    if (teamIdentifier && parsed.teamId) {
      const key = `${normalizeImportLabel(parsed.division)}|${parsed.fallbackGroup}|${normalizeTeamName(parsed.teamId)}`;
      const existing = groupedRows.get(key);
      if (existing) {
        if (parsed.team) existing.names.push(parsed.team);
        parsed.sourceColumns.forEach((column) => existing.sourceColumns.add(column));
      } else {
        groupedRows.set(key, { index, division: parsed.division, teamId: parsed.teamId, names: parsed.team ? [parsed.team] : [], sourceColumns: new Set(parsed.sourceColumns), fallbackGroup: parsed.fallbackGroup });
      }
    } else parsedRows.push(parsed);
    dataStarted = true;
    previousSourceRow = sourceRow;
  }
  const rows: CanonicalImportRow[] = [];
  const materializedRows: ParsedRow[] = [
    ...parsedRows,
    ...[...groupedRows.values()].map((group) => ({
      index: group.index,
      division: group.division,
      team: normalizeTeamValue([...new Set(group.names)].join(' / ')) || group.teamId,
      sourceColumns: [...group.sourceColumns],
      joined: group.names.length > 1,
      fallbackGroup: group.fallbackGroup
    }))
  ].sort((a, b) => a.index - b.index);
  for (const item of materializedRows) {
    const division = item.division ? candidateDivisionName(item.division, sheet, divisions) : null;
    const reasons = [division?.reason ?? 'A division still needs to be selected.'];
    if (teamIdentifier) {
      reasons.push('Combined participant rows that shared the same team identifier.');
    } else if (teamColumn !== undefined) {
      reasons.push('Used the explicit team column.');
    } else if (participantColumns.length === 1) {
      reasons.push('Used the participant/name column as the team name.');
    } else if (item.joined) {
      reasons.push('Joined participant columns with “ / ”.');
    }
    const warnings = [...(selected ? [] : ['This sheet is not selected for import.'])];
    if (!division) warnings.push('Choose a division before importing this row.');
    if (!item.team) warnings.push('Choose or enter a team name before importing this row.');
    const confidence: ImportConfidence = division && item.team
      ? divisionColumn !== undefined || teamColumn !== undefined || participantColumns.length > 0 ? 'high' : 'medium'
      : 'low';
    rows.push(createRow(sheet, item.index, item.sourceColumns, division?.value ?? '', item.team, confidence, reasons, warnings, selected, item.fallbackGroup));
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
  const possibleHeaderIndex = divisionHeader.index + 1 < sheet.rows.length ? divisionHeader.index + 1 : divisionHeader.index;
  const possibleHeader = participantGroupsForHeaderRow(sheet.rows[possibleHeaderIndex]);
  const hasBlockHeader = [...possibleHeader.roles.values()].some((role) => role === 'participant' || role === 'team' || role === 'ignored');
  const blockHeaderIndex = hasBlockHeader ? possibleHeaderIndex : divisionHeader.index;
  const blockHeaders = participantGroupsForHeaderRow(sheet.rows[blockHeaderIndex]);
  const mapping: SheetMapping = {
    sheet: sheet.name,
    selected,
    layout: 'Division names as column headers',
    headerRow: rowNumber(sheet, divisionHeader.index),
    participantColumns: divisionHeader.columns.map((column) => column + 1),
    ignoredColumns: [],
    foundRows: 0
  };
  for (let index = 0; index < divisionHeader.index; index += 1) {
    const cells = nonEmptyCells(sheet.rows[index]);
    if (cells.length) addIgnored(ignoredRows, sheet, index, cells.map(({ column }) => column + 1), 'Title or preamble row.');
  }
  if (hasBlockHeader) addIgnored(ignoredRows, sheet, blockHeaderIndex, nonEmptyCells(sheet.rows[blockHeaderIndex]).map(({ column }) => column + 1), 'Repeated header row.');
  for (let index = blockHeaderIndex + 1; index < sheet.rows.length; index += 1) {
    const row = sheet.rows[index];
    const sourceCells = nonEmptyCells(row);
    if (!sourceCells.length) continue;
    if (looksLikeRepeatedHeader(row) || isHardIgnoredRow(sourceCells[0].value)) {
      addIgnored(ignoredRows, sheet, index, sourceCells.map(({ column }) => column + 1), looksLikeRepeatedHeader(row) ? 'Repeated header row.' : 'Instruction, contact, or total row.');
      continue;
    }
    for (let blockIndex = 0; blockIndex < divisionHeader.columns.length; blockIndex += 1) {
      const start = divisionHeader.columns[blockIndex];
      const end = divisionHeader.columns[blockIndex + 1] ?? (hasBlockHeader ? row.length : start + 1);
      const blockColumns = Array.from({ length: Math.max(0, end - start) }, (_, offset) => start + offset);
      const headerRoles = blockColumns.map((column) => [column, blockHeaders.roles.get(column)] as const);
      const participantColumns = headerRoles.filter(([, role]) => role === 'participant').map(([column]) => column);
      const columns = participantColumns.length ? participantColumns : blockColumns.filter((column) => Boolean(textValue(row[column])) && !isIgnoredRow(textValue(row[column])));
      const groups = participantColumns.length
        ? participantGroupsForColumns(sheet.rows[blockHeaderIndex], participantColumns)
        : undefined;
      const teamData = teamFromCells(row, columns, groups);
      if (!teamData.team) continue;
      const division = candidateDivisionName(headers[start], sheet, []);
      if (!division) continue;
      rows.push(createRow(sheet, index, teamData.sourceColumns, division.value, teamData.team, 'high', ['Used the division name from the column header.', ...(teamData.joined ? ['Joined participant columns with “ / ”.'] : [])], selected ? [] : ['This sheet is not selected for import.'], selected));
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
  let sectionHeaderIndex = -1;
  let sectionColumns: number[] | undefined;
  let sectionGroups: number[][] | undefined;
  let sectionGroupIndex = 0;
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
    if (!currentDivision && /^(?:please|note|updated|instructions?|thanks|thank you)\b|\b(?:tournament|registration|sign ups?)\b/i.test(value)) {
      addIgnored(ignoredRows, sheet, index, cells.map(({ column }) => column + 1), 'Title or preamble row.');
      continue;
    }
    if (looksLikeRepeatedHeader(sheet.rows[index])) { addIgnored(ignoredRows, sheet, index, cells.map(({ column }) => column + 1), 'Header or instruction row.'); continue; }
    if (isIgnoredRow(value)) { addIgnored(ignoredRows, sheet, index, [usableColumn + 1], 'Instruction, contact, or total row.'); continue; }
    const hasSupportingTeam = sheet.rows.slice(index + 1, index + 4).some((next) => {
      const nextValue = textValue(next[usableColumn]) || nonEmptyCells(next)[0]?.value || '';
      return Boolean(nextValue) && !isDivisionLike(nextValue) && !isIgnoredRow(nextValue);
    });
    const isDivisionMarker = isDivisionSectionLabel(value) || divisions.some((division) => normalizeImportLabel(division.name) === normalizeImportLabel(value));
    const isMarker = Boolean(value) && (isDivisionMarker || likelyGroupMarker(value)) && hasSupportingTeam;
    if (isMarker) {
      sectionGroupIndex += 1;
      currentDivision = divisionDisplayValue(value);
      if (!isDivisionMarker) currentDivision = '';
      markerIndex = index;
      sectionHeaderIndex = -1;
      sectionColumns = undefined;
      sectionGroups = undefined;
      for (let candidateIndex = index + 1; candidateIndex < Math.min(sheet.rows.length, index + 4); candidateIndex += 1) {
        if (!nonEmptyCells(sheet.rows[candidateIndex]).length) continue;
        const candidate = participantGroupsForHeaderRow(sheet.rows[candidateIndex]);
        const participantColumns = [...candidate.roles.entries()].filter(([, role]) => role === 'participant').map(([column]) => column);
        const teamColumn = [...candidate.roles.entries()].find(([, role]) => role === 'team')?.[0];
        if (participantColumns.length || teamColumn !== undefined) {
          sectionHeaderIndex = candidateIndex;
          sectionGroups = candidate.groups.length ? candidate.groups : undefined;
          sectionColumns = participantColumns.length ? participantColumns : teamColumn === undefined ? undefined : [teamColumn];
          addIgnored(ignoredRows, sheet, candidateIndex, nonEmptyCells(sheet.rows[candidateIndex]).map(({ column }) => column + 1), 'Section header row.');
          break;
        }
      }
      continue;
    }
    if (index === markerIndex || index === sectionHeaderIndex) continue;
    const teamData = sectionGroups
      ? teamFromCells(sheet.rows[index], undefined, sectionGroups)
      : sectionColumns
        ? teamFromCells(sheet.rows[index], sectionColumns)
        : teamFromCells(sheet.rows[index]);
    if (!teamData.team) continue;
    const division = currentDivision;
    const warnings = [...(selected ? [] : ['This sheet is not selected for import.'])];
    if (!division) warnings.push('Choose a division before importing this row.');
    const reasons = division === sheetDivision
      ? ['Used the sheet name as the division.']
      : ['Used the most recent division section marker.'];
    if (teamData.joined) reasons.push('Joined adjacent values with “ / ”.');
    const confidence: ImportConfidence = division ? (isDivisionLike(division) ? 'high' : 'medium') : 'low';
    rows.push(createRow(sheet, index, teamData.sourceColumns, division, teamData.team, confidence, reasons, warnings, selected, fallbackGroupKey(sheet, sectionGroupIndex)));
    mapping.foundRows += 1;
  }
  return { rows, mapping };
}

function inferSheet(sheet: ImportSheet, divisions: Division[], ignoredRows: IgnoredImportRow[]): { rows: CanonicalImportRow[]; mapping: SheetMapping; ignored?: { sheet: string; reason: string } } {
  const ignoredByName = IGNORED_SHEET_NAMES.test(sheet.name);
  const selected = !sheet.hidden && !ignoredByName;
  if (ignoredByName) {
    const mapping: SheetMapping = { sheet: sheet.name, selected: false, layout: 'Ignored sheet', participantColumns: [], ignoredColumns: [], foundRows: 0, reason: 'The sheet name suggests notes, instructions, scores, or unrelated data.' };
    return { rows: [], mapping, ignored: { sheet: sheet.name, reason: mapping.reason! } };
  }
  if (!sheet.rows.length) {
    const mapping: SheetMapping = { sheet: sheet.name, selected: false, layout: 'Empty sheet', participantColumns: [], ignoredColumns: [], foundRows: 0, reason: 'The sheet has no values.' };
    return { rows: [], mapping, ignored: { sheet: sheet.name, reason: mapping.reason! } };
  }
  const headerCandidate = findHeader(sheet);
  const divisionHeader = findDivisionHeader(sheet);
  const preambleHasDivisionMarker = headerCandidate
    ? sheet.rows.slice(0, headerCandidate.index).some((row) => {
      const cells = nonEmptyCells(row);
      return cells.length === 1 && isDivisionSectionLabel(cells[0].value);
    })
    : false;
  const participantOnlyHeader = Boolean(headerCandidate)
    && [...headerCandidate!.roles.values()].includes('participant')
    && headerCandidate!.roles.size > 1
    && !divisionHeader
    && !preambleHasDivisionMarker;
  const header = headerCandidate && (
    [...headerCandidate.roles.values()].includes('division')
    || [...headerCandidate.roles.values()].includes('team')
    || participantOnlyHeader
    || isSheetDivisionCandidate(sheet.name, divisions)
  ) ? headerCandidate : null;
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

function preferredDivisionName(value: string): string {
  const clean = divisionDisplayValue(value);
  const key = normalizeImportLabel(clean);
  if (key === 'beginner') return 'Beginner';
  if (key === 'beginner intermediate') return 'Beginner/Intermediate';
  const rating = clean.match(/\d+(?:\.\d+)?/)?.[0];
  if (rating && key.endsWith(' men')) return `Men's ${rating}`;
  if (rating && key.endsWith(' women')) return `Women's ${rating}`;
  if (rating && key.endsWith(' mixed')) return `Mixed ${rating.includes('.') ? rating : `${rating}.0`}`;
  return clean;
}

function fallbackDivisionName(index: number, used: Set<string>): string {
  let offset = index;
  while (true) {
    let suffix = '';
    let value = offset;
    do {
      suffix = String.fromCharCode(65 + (value % 26)) + suffix;
      value = Math.floor(value / 26) - 1;
    } while (value >= 0);
    const candidate = `Division ${suffix}`;
    if (!used.has(normalizeImportLabel(candidate))) return candidate;
    offset += 1;
  }
}

function assignFallbackDivisions(rows: CanonicalImportRow[], divisions: Division[]): CanonicalImportRow[] {
  const groups = new Map<string, CanonicalImportRow[]>();
  for (const row of rows) {
    if (!row.team || row.division) continue;
    const key = row.fallbackGroup ?? row.source.sheet;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const hasExplicitDivision = rows.some((row) => Boolean(row.division));
  const used = new Set([
    ...divisions.map((division) => normalizeImportLabel(division.name)),
    ...rows.filter((row) => row.division).map((row) => normalizeImportLabel(row.division))
  ]);
  let fallbackIndex = 0;
  const fallbackNames = new Map<string, string>();
  for (const [key, group] of groups) {
    // A singleton beside confidently labelled sections is more likely an accidental
    // title or orphaned row. Keep it reviewable; otherwise positional grouping is a
    // useful, honest default for organizer exports that omitted division names.
    if (hasExplicitDivision && group.length < 2) continue;
    const name = fallbackDivisionName(fallbackIndex, used);
    fallbackIndex += 1;
    used.add(normalizeImportLabel(name));
    fallbackNames.set(key, name);
  }
  return rows.map((row) => {
    if (!row.team || row.division) return row;
    const name = fallbackNames.get(row.fallbackGroup ?? row.source.sheet);
    if (!name) return row;
    return {
      ...row,
      division: name,
      confidence: row.confidence === 'low' ? 'medium' : row.confidence,
      included: row.included || Boolean(row.team && row.source.sheet && !row.warnings.some((warning) => warning.includes('not selected'))),
      reasons: [...row.reasons.filter((reason) => reason !== 'A division still needs to be selected.'), `No division label was available; grouped this row by its position and assigned ${name}.`],
      warnings: row.warnings.filter((warning) => warning !== 'Choose a division before importing this row.')
    };
  });
}

function reconcileRows(rows: CanonicalImportRow[], divisions: Division[], teams: Team[]): { rows: CanonicalImportRow[]; newDivisions: string[] } {
  const divisionByKey = new Map(divisions.map((division) => [normalizeImportLabel(division.name), division.name]));
  const newDivisions = new Map<string, string>();
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
      } else {
        const key = normalizeImportLabel(next.division);
        const preferred = newDivisions.get(key) ?? preferredDivisionName(next.division);
        newDivisions.set(key, preferred);
        next.division = preferred;
        if (preferred !== row.division) next.reasons.push('Normalized a common division abbreviation or spelling variation.');
      }
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
  return { rows: reconciled, newDivisions: [...newDivisions.values()] };
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
  const withFallbackDivisions = assignFallbackDivisions(inferred.flatMap(({ rows }) => rows), divisions);
  const reconciled = reconcileRows(withFallbackDivisions, divisions, teams);
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
  const sample = firstLine.replace(/"[^"]*"/g, '');
  const delimiter = ([',', '\t', ';', '|'] as const)
    .map((candidate, index) => ({ candidate, count: [...sample].filter((character) => character === candidate).length, index }))
    .sort((a, b) => b.count - a.count || a.index - b.index)[0].candidate;
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

async function readPdfFile(file: File): Promise<ImportWorkbook> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useWorkerFetch: false,
    useSystemFonts: true,
    isEvalSupported: false
  }).promise;
  const sheets: ImportSheet[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines: { y: number; items: { x: number; value: string }[] }[] = [];
    for (const rawItem of content.items as Array<{ str?: unknown; transform?: unknown }>) {
      const value = textValue(rawItem.str);
      const transform = Array.isArray(rawItem.transform) ? rawItem.transform : [];
      if (!value || transform.length < 6) continue;
      const x = Number(transform[4]) || 0;
      const y = Number(transform[5]) || 0;
      let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 2.5);
      if (!line) {
        line = { y, items: [] };
        lines.push(line);
      }
      line.items.push({ x, value });
    }
    const rows = lines
      .sort((a, b) => b.y - a.y)
      .map((line) => line.items.sort((a, b) => a.x - b.x).map((item) => item.value));
    if (rows.length) sheets.push({ name: `Page ${pageNumber}`, rows, rowNumbers: rows.map((_, index) => index + 1) });
  }
  return { sourceName: file.name, sheets };
}

export async function inspectImportFile(file: File, divisions: Division[], teams: Team[]): Promise<ImportReview> {
  if (file.size > IMPORT_LIMITS.fileBytes) {
    return { sourceName: file.name, rows: [], ignoredRows: [], mappings: [], newDivisions: [], ignoredSheets: [], warnings: [], errors: [`This file is larger than ${Math.round(IMPORT_LIMITS.fileBytes / 1024 / 1024)} MB. Choose a smaller workbook or paste only the registration rows.`] };
  }
  const lowerName = file.name.toLocaleLowerCase();
  if (lowerName.endsWith('.csv') || file.type === 'text/csv') return inspectImportText(await file.text(), divisions, teams, file.name);
  if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls') && !lowerName.endsWith('.pdf')) {
    return { sourceName: file.name, rows: [], ignoredRows: [], mappings: [], newDivisions: [], ignoredSheets: [], warnings: [], errors: ['Choose a CSV, XLSX, XLS, or PDF file.'] };
  }
  try {
    const workbook = lowerName.endsWith('.pdf') ? await readPdfFile(file) : await readSpreadsheetFile(file);
    return reviewImportWorkbook(workbook, divisions, teams);
  } catch (error) {
    return { sourceName: file.name, rows: [], ignoredRows: [], mappings: [], newDivisions: [], ignoredSheets: [], warnings: [], errors: [error instanceof Error ? `Could not read this workbook: ${error.message}` : 'Could not read this workbook.'] };
  }
}

export function summarizeImportReview(review: ImportReview, divisions: Division[]): ImportSummary {
  const known = new Set(divisions.map((division) => normalizeImportLabel(division.name)));
  const newDivisionNames = new Map<string, string>();
  for (const name of review.rows.filter((row) => row.included && row.division).map((row) => row.division.trim())) {
    const key = normalizeImportLabel(name);
    if (!known.has(key) && !newDivisionNames.has(key)) newDivisionNames.set(key, preferredDivisionName(name));
  }
  return {
    ready: review.rows.filter((row) => row.included && row.division.trim() && row.team.trim()).length,
    warningRows: review.rows.filter((row) => row.warnings.length > 0).length,
    duplicates: review.rows.filter((row) => Boolean(row.duplicate)).length,
    unresolved: review.rows.filter((row) => row.included && (!row.division.trim() || !row.team.trim())).length,
    ignored: review.ignoredRows.length + review.rows.filter((row) => !row.included).length,
    newDivisions: [...newDivisionNames.values()]
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
